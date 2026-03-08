import express from "express";
import { GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import r2Client, { BUCKET_NAME } from "../s3.js";
import supabase from "../supabase.js";

const router = express.Router();

// In-memory one-time token store: token -> { file, expiresAt }
const pendingDownloads = new Map();
const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

function getPublicBaseUrl(req) {
  if (process.env.API_PUBLIC_URL)
    return process.env.API_PUBLIC_URL.replace(/\/$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

function registerPendingDownload(file) {
  const token = randomUUID();
  pendingDownloads.set(token, { file, expiresAt: Date.now() + TOKEN_TTL_MS });
  return token;
}

function consumePendingDownload(token) {
  const entry = pendingDownloads.get(token);
  if (!entry) return null;

  // Single-use
  pendingDownloads.delete(token);

  if (Date.now() > entry.expiresAt) return null;
  return entry.file;
}

function setDownloadHeaders(res, file) {
  const safeName = encodeURIComponent(file.filename || "download");
  res.setHeader("Content-Type", "application/octet-stream");
  if (file.size) res.setHeader("Content-Length", String(file.size));
  res.setHeader(
    "Content-Disposition",
    `attachment; filename*=UTF-8''${safeName}`,
  );
  res.setHeader("Cache-Control", "no-store");
}

// Clean expired tokens periodically
setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of pendingDownloads.entries()) {
    if (entry.expiresAt <= now) pendingDownloads.delete(token);
  }
}, 60 * 1000).unref();

// GET /api/download/stream/:token
// Streams object via backend and deletes only after successful stream completion.
router.get("/stream/:token", async (req, res) => {
  const { token } = req.params;
  const file = consumePendingDownload(token);

  if (!file) {
    return res.status(404).json({ error: "Invalid or expired download link" });
  }

  if (new Date(file.expires_at) < new Date()) {
    await cleanupFile(file);
    return res
      .status(410)
      .json({ error: "This file has expired and is no longer available." });
  }

  try {
    const object = await r2Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: file.r2_key,
      }),
    );

    const bodyStream = object.Body;
    if (!bodyStream || typeof bodyStream.pipe !== "function") {
      return res.status(500).json({ error: "Failed to stream file" });
    }

    setDownloadHeaders(res, file);

    let streamedBytes = 0;
    bodyStream.on("data", (chunk) => {
      streamedBytes += chunk.length;
    });

    bodyStream.on("error", (err) => {
      console.error("Stream error:", err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: "Download stream failed" });
      } else {
        res.destroy(err);
      }
    });

    res.on("finish", async () => {
      const expectedSize = Number(file.size || 0);
      const completed =
        expectedSize > 0 ? streamedBytes >= expectedSize : streamedBytes > 0;
      if (res.statusCode < 400 && completed) {
        await cleanupFile(file);
      }
    });

    bodyStream.pipe(res);
  } catch (err) {
    console.error("Proxy download error:", err.message);
    return res
      .status(500)
      .json({ error: "Failed to download file", detail: err.message });
  }
});

// GET /api/download/:passcode
router.get("/:passcode", async (req, res) => {
  try {
    const { passcode } = req.params;

    if (!/^\d{6}$/.test(passcode)) {
      return res
        .status(400)
        .json({ error: "Passcode must be exactly 6 digits" });
    }

    // Look up file by passcode
    const { data: file, error } = await supabase
      .from("files")
      .select("*")
      .eq("passcode", passcode)
      .single();

    if (error || !file) {
      return res
        .status(404)
        .json({ error: "Invalid passcode. No file found." });
    }

    // Check expiry
    if (new Date(file.expires_at) < new Date()) {
      // Clean up expired file from R2 and DB
      await cleanupFile(file);
      return res
        .status(410)
        .json({ error: "This file has expired and is no longer available." });
    }

    // Create one-time proxy URL (valid 15 min)
    const token = registerPendingDownload(file);
    const signedUrl = `${getPublicBaseUrl(req)}/api/download/stream/${token}`;

    // Return metadata + one-time proxy URL.
    // Deletion happens only after successful streamed download.
    res.status(200).json({
      filename: file.filename,
      size: file.size,
      signedUrl,
      createdAt: file.created_at,
      expiresAt: file.expires_at,
    });
  } catch (err) {
    console.error("Download error:", err);
    return res
      .status(500)
      .json({ error: "Failed to retrieve file", detail: err.message });
  }
});

async function cleanupFile(file) {
  try {
    // Delete from Cloudflare R2
    await r2Client.send(
      new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: file.r2_key,
      }),
    );
    // Delete record from Supabase
    await supabase.from("files").delete().eq("id", file.id);
    console.log(`🗑 Deleted file: ${file.filename} (ID: ${file.id})`);
  } catch (err) {
    console.error("Cleanup error:", err.message);
  }
}

export default router;
