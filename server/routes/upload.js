import express from "express";
import multer from "multer";
import fs from "fs";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";
import r2Client, { BUCKET_NAME } from "../s3.js";
import supabase from "../supabase.js";
import { requireAuth } from "../middleware/auth.js";
import { checkUsageLimit, incrementUsage } from "./usage.js";

const router = express.Router();
const PASSCODE_LENGTH = 6;
const PASSCODE_MAX = 10 ** PASSCODE_LENGTH;
const FILE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// Use disk storage so large files (up to 8 GB) don't blow up RAM
const upload = multer({
  storage: multer.diskStorage({
    destination: "/tmp",
    filename: (_req, file, cb) =>
      cb(null, `${Date.now()}-${file.originalname}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024 * 1024 }, // 8 GB
});

/** Generate a random 6-digit numeric passcode (with leading zeros if needed) */
function generatePasscode() {
  const code = Math.floor(Math.random() * PASSCODE_MAX); // 0-999999
  return String(code).padStart(PASSCODE_LENGTH, "0"); // Always exactly 6 digits
}

// POST /api/upload
router.post("/", requireAuth, upload.single("file"), async (req, res) => {
  const tmpPath = req.file?.path;

  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file provided" });
    }

    // ── Usage limit check ─────────────────────────────────────────────
    const { allowed, used } = await checkUsageLimit(req.user.id, req.file.size);
    if (!allowed) {
      fs.unlink(tmpPath, () => {}); // clean up temp file
      return res.status(402).json({
        error: "limit_exceeded",
        message:
          "Monthly storage limit reached. Upgrade to continue uploading.",
        bytesUsed: used,
        freeLimit: 8 * 1024 * 1024 * 1024,
      });
    }

    const { originalname, mimetype, size } = req.file;
    const fileId = uuidv4();
    const key = `uploads/${fileId}/${originalname}`;

    // Stream file from disk → R2 (avoids loading 8 GB into RAM)
    const fileStream = fs.createReadStream(tmpPath);
    await r2Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: fileStream,
        ContentType: mimetype,
        ContentLength: size, // required when streaming
      }),
    );

    // Clean up temp file after upload
    fs.unlink(tmpPath, () => {});

    // Generate unique 6-digit passcode (retry on collision)
    let passcode;
    let isUniquePasscode = false;
    let attempts = 0;
    while (attempts < 12) {
      passcode = generatePasscode();
      const { data: existing, error: lookupError } = await supabase
        .from("files")
        .select("id")
        .eq("passcode", passcode)
        .maybeSingle();

      if (lookupError) {
        throw lookupError;
      }

      if (!existing) {
        isUniquePasscode = true;
        break;
      }

      attempts++;
    }

    if (!isUniquePasscode) {
      return res.status(500).json({ error: "Failed to generate passcode" });
    }

    const fileUrl = `https://${process.env.CF_R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET_NAME}/${key}`;

    // Save metadata to Supabase with default 30-minute expiry
    const { error: dbError } = await supabase.from("files").insert({
      id: fileId,
      user_id: req.user.id,
      filename: originalname,
      url: fileUrl,
      r2_key: key,
      passcode,
      size,
      expires_at: new Date(Date.now() + FILE_TTL_MS).toISOString(),
    });

    if (dbError) {
      console.error("DB insert error:", dbError);
      return res.status(500).json({ error: "Failed to save file metadata" });
    }

    // Increment monthly bandwidth usage (fire-and-forget)
    setImmediate(() => incrementUsage(req.user.id, size));

    return res.status(200).json({
      passcode,
      filename: originalname,
      size,
    });
  } catch (err) {
    // Always clean up temp file on error
    if (tmpPath) fs.unlink(tmpPath, () => {});
    console.error("Upload error:", err);
    return res
      .status(500)
      .json({ error: "Upload failed", detail: err.message });
  }
});

export default router;
