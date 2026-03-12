import express from "express";
import multer from "multer";
import fs from "fs";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";
import r2Client, { BUCKET_NAME } from "../s3.js";
import supabase from "../supabase.js";
import { optionalAuth } from "../middleware/auth.js";
import { checkUsageLimit, incrementUsage } from "./usage.js";

const router = express.Router();
const PASSCODE_LENGTH = 6;
const PASSCODE_MAX = 10 ** PASSCODE_LENGTH;
const FREE_FILE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const GUEST_MAX_BYTES = 500 * 1024 * 1024; // 500 MB
const MAX_PAID_EXPIRY_HOURS = 72;
const SUPPORTED_PLAN_GB = new Set([1, 3, 5, 10]);

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

function getPlanGbFromUser(user) {
  const planGbRaw = user?.user_metadata?.plan_gb ?? user?.app_metadata?.plan_gb;
  const planGb = Number(planGbRaw);
  if (Number.isFinite(planGb) && SUPPORTED_PLAN_GB.has(planGb)) return planGb;
  return 0;
}

function getFilePolicyForUser(user) {
  const planGb = getPlanGbFromUser(user);
  if (planGb > 0) {
    const expiryHours = Math.min(planGb * 12, MAX_PAID_EXPIRY_HOURS);
    return {
      planGb,
      expiryMs: expiryHours * 60 * 60 * 1000,
      maxDownloads: planGb * 5,
    };
  }

  return {
    planGb: 0,
    expiryMs: FREE_FILE_TTL_MS,
    maxDownloads: 1,
  };
}

// POST /api/upload — guests (no auth) get 500 MB / 30 min / 1 download
// Authenticated users get their plan-based policy
router.post("/", optionalAuth, upload.single("file"), async (req, res) => {
  const tmpPath = req.file?.path;

  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file provided" });
    }

    const { originalname, mimetype, size } = req.file;
    const isGuest = !req.user;

    // ── Guest: enforce 500 MB cap ─────────────────────────────────────
    if (isGuest && size > GUEST_MAX_BYTES) {
      fs.unlink(tmpPath, () => {});
      return res.status(413).json({
        error: "guest_limit_exceeded",
        message:
          "Guest uploads are limited to 500 MB. Sign in to upload up to 8 GB.",
        maxBytes: GUEST_MAX_BYTES,
      });
    }

    // ── Authenticated: usage limit check ──────────────────────────────
    if (!isGuest) {
      const { allowed, used } = await checkUsageLimit(req.user.id, size);
      if (!allowed) {
        fs.unlink(tmpPath, () => {});
        return res.status(402).json({
          error: "limit_exceeded",
          message:
            "Monthly storage limit reached. Upgrade to continue uploading.",
          bytesUsed: used,
          freeLimit: 8 * 1024 * 1024 * 1024,
        });
      }
    }
    const fileId = uuidv4();
    const key = `uploads/${fileId}/${originalname}`;
    const filePolicy = isGuest
      ? { planGb: 0, expiryMs: FREE_FILE_TTL_MS, maxDownloads: 1 }
      : getFilePolicyForUser(req.user);

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

    // Save metadata to Supabase with plan-based expiry/download policy
    const { error: dbError } = await supabase.from("files").insert({
      id: fileId,
      user_id: req.user?.id ?? null,
      filename: originalname,
      url: fileUrl,
      r2_key: key,
      passcode,
      size,
      expires_at: new Date(Date.now() + filePolicy.expiryMs).toISOString(),
      max_downloads: filePolicy.maxDownloads,
      download_count: 0,
    });

    if (dbError) {
      console.error("DB insert error:", JSON.stringify(dbError, null, 2));
      return res.status(500).json({
        error: "Failed to save file metadata",
        detail: dbError.message,
        hint: dbError.hint ?? null,
        code: dbError.code ?? null,
      });
    }

    // Increment monthly bandwidth usage for authenticated users only
    if (!isGuest) {
      setImmediate(() => incrementUsage(req.user.id, size));
    }

    return res.status(200).json({
      passcode,
      filename: originalname,
      size,
      maxDownloads: filePolicy.maxDownloads,
      expiresInMs: filePolicy.expiryMs,
      planGb: filePolicy.planGb,
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
