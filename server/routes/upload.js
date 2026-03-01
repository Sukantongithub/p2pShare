import express from 'express';
import multer from 'multer';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import r2Client, { BUCKET_NAME } from '../s3.js';
import supabase from '../supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// Multer: store in memory, limit 1 GB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1 * 1024 * 1024 * 1024 },
});

/** Generate a random 6-digit numeric passcode */
function generatePasscode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// POST /api/upload
router.post('/', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const { originalname, buffer, mimetype } = req.file;
    const fileId = uuidv4();
    const key = `uploads/${fileId}/${originalname}`;

    // Upload to Cloudflare R2
    await r2Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: mimetype,
      })
    );

    // Generate unique passcode (retry on collision)
    let passcode;
    let attempts = 0;
    while (attempts < 5) {
      passcode = generatePasscode();
      const { data: existing } = await supabase
        .from('files')
        .select('id')
        .eq('passcode', passcode)
        .single();
      if (!existing) break;
      attempts++;
    }

    const fileUrl = `https://${process.env.CF_R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET_NAME}/${key}`;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 minutes

    // Save metadata to Supabase
    const { error: dbError } = await supabase.from('files').insert({
      id: fileId,
      user_id: req.user.id,
      filename: originalname,
      url: fileUrl,
      r2_key: key,
      passcode,
      size: req.file.size,
      expires_at: expiresAt,
    });

    if (dbError) {
      console.error('DB insert error:', dbError);
      return res.status(500).json({ error: 'Failed to save file metadata' });
    }

    return res.status(200).json({
      passcode,
      filename: originalname,
      size: req.file.size,
      expiresAt,
    });
  } catch (err) {
    console.error('Upload error:', err);
    return res.status(500).json({ error: 'Upload failed', detail: err.message });
  }
});

export default router;
