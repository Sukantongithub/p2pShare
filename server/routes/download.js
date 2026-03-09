import express from "express";
import { GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import r2Client, { BUCKET_NAME } from "../s3.js";
import supabase from "../supabase.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

// In-memory one-time token store: token -> { file, downloader, expiresAt }
const pendingDownloads = new Map();
const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

function getPublicBaseUrl(req) {
  if (process.env.API_PUBLIC_URL)
    return process.env.API_PUBLIC_URL.replace(/\/$/, "");

  // Trust the forwarded protocol (Vite proxy, Render, Vercel, nginx all set this)
  const proto =
    req.headers["x-forwarded-proto"]?.split(",")[0]?.trim() ||
    req.protocol ||
    "https";

  return `${proto}://${req.get("host")}`;
}

async function extractDownloaderIdentity(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  const ip = req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() || req.ip || null;
  const userAgent = req.headers["user-agent"] || null;

  const identity = {
    downloaderUserId: null,
    downloaderEmail: null,
    ip,
    userAgent,
  };

  if (!authHeader || typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
    return identity;
  }

  const token = authHeader.slice(7);
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (!error && user) {
      identity.downloaderUserId = user.id;
      identity.downloaderEmail = user.email || null;
    }
  } catch {
    // Ignore auth parsing failures for optional downloader identity
  }

  return identity;
}

function registerPendingDownload(file, downloader) {
  const token = randomUUID();
  pendingDownloads.set(token, { file, downloader, expiresAt: Date.now() + TOKEN_TTL_MS });
  return token;
}

function consumePendingDownload(token) {
  const entry = pendingDownloads.get(token);
  if (!entry) return null;

  // Single-use
  pendingDownloads.delete(token);

  if (Date.now() > entry.expiresAt) return null;
  return entry;
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

async function registerSuccessfulDownload(file, downloader) {
  const nowIso = new Date().toISOString();

  const { data: latestFile, error: latestFileError } = await supabase
    .from("files")
    .select("id, user_id, filename, r2_key, download_count, max_downloads")
    .eq("id", file.id)
    .maybeSingle();

  if (latestFileError || !latestFile) {
    if (latestFileError) {
      console.error("Download stats read error:", latestFileError.message);
    }
    return;
  }

  const currentCount = Number(latestFile.download_count || 0);
  const maxDownloads = Math.max(Number(latestFile.max_downloads || 1), 1);
  const nextCount = currentCount + 1;

  const { error: updateError } = await supabase
    .from("files")
    .update({
      download_count: nextCount,
      last_downloaded_at: nowIso,
    })
    .eq("id", latestFile.id);

  if (updateError) {
    console.error("Download stats update error:", updateError.message);
  }

  const { error: eventError } = await supabase.from("download_events").insert({
    file_id: latestFile.id,
    owner_user_id: latestFile.user_id,
    downloader_user_id: downloader?.downloaderUserId || null,
    downloader_email: downloader?.downloaderEmail || null,
    downloader_ip: downloader?.ip || null,
    downloader_user_agent: downloader?.userAgent || null,
    downloaded_at: nowIso,
    download_index: nextCount,
  });

  if (eventError) {
    console.error("Download event insert error:", eventError.message);
  }

  if (nextCount >= maxDownloads) {
    await cleanupFile(latestFile);
  }
}

// GET /api/download/stream/:token
// Streams object via backend and deletes only after successful stream completion.
router.get("/stream/:token", async (req, res) => {
  const { token } = req.params;
  const pending = consumePendingDownload(token);
  const file = pending?.file;
  const downloader = pending?.downloader;

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
        await registerSuccessfulDownload(file, downloader);
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

    const downloadCount = Number(file.download_count || 0);
    const maxDownloads = Math.max(Number(file.max_downloads || 1), 1);

    // Check expiry
    if (new Date(file.expires_at) < new Date()) {
      // Clean up expired file from R2 and DB
      await cleanupFile(file);
      return res
        .status(410)
        .json({ error: "This file has expired and is no longer available." });
    }

    // Enforce download limit
    if (downloadCount >= maxDownloads) {
      await cleanupFile(file);
      return res.status(410).json({ error: "Download limit reached for this file." });
    }

    const downloader = await extractDownloaderIdentity(req);

    // Create one-time proxy URL (valid 15 min)
    const token = registerPendingDownload(file, downloader);
    const signedUrl = `${getPublicBaseUrl(req)}/api/download/stream/${token}`;

    // Return metadata + one-time proxy URL.
    // Deletion happens only after successful streamed download.
    res.status(200).json({
      filename: file.filename,
      size: file.size,
      signedUrl,
      createdAt: file.created_at,
      expiresAt: file.expires_at,
      maxDownloads,
      downloadCount,
      downloadsRemaining: Math.max(maxDownloads - downloadCount, 0),
    });
  } catch (err) {
    console.error("Download error:", err);
    return res
      .status(500)
      .json({ error: "Failed to retrieve file", detail: err.message });
  }
});

// GET /api/download/analytics/:fileId
// Owner-only analytics for file access tracking.
router.get("/analytics/:fileId", requireAuth, async (req, res) => {
  try {
    const { fileId } = req.params;

    const { data: file, error: fileError } = await supabase
      .from("files")
      .select("id, user_id, filename, download_count, max_downloads, expires_at, created_at")
      .eq("id", fileId)
      .maybeSingle();

    if (fileError || !file) {
      return res.status(404).json({ error: "File not found" });
    }

    if (file.user_id !== req.user.id) {
      return res.status(403).json({ error: "Not allowed" });
    }

    const { data: events, error: eventsError } = await supabase
      .from("download_events")
      .select("downloader_user_id, downloader_email, downloader_ip, downloaded_at, download_index")
      .eq("file_id", fileId)
      .order("downloaded_at", { ascending: false })
      .limit(100);

    if (eventsError) {
      return res.status(500).json({ error: "Failed to fetch analytics" });
    }

    return res.status(200).json({
      file,
      analytics: {
        totalDownloads: Number(file.download_count || 0),
        maxDownloads: Math.max(Number(file.max_downloads || 1), 1),
        events,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch analytics", detail: err.message });
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
