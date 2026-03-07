import express from 'express';
import { GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import r2Client, { BUCKET_NAME } from '../s3.js';
import supabase from '../supabase.js';

const router = express.Router();

// GET /api/download/:passcode
router.get('/:passcode', async (req, res) => {
  try {
    const { passcode } = req.params;

    if (!/^\d{6}$/.test(passcode)) {
      return res.status(400).json({ error: 'Passcode must be exactly 6 digits' });
    }

    // Look up file by passcode
    const { data: file, error } = await supabase
      .from('files')
      .select('*')
      .eq('passcode', passcode)
      .single();

    if (error || !file) {
      return res.status(404).json({ error: 'Invalid passcode. No file found.' });
    }

    // Check expiry
    if (new Date(file.expires_at) < new Date()) {
      // Clean up expired file from R2 and DB
      await cleanupFile(file);
      return res.status(410).json({ error: 'This file has expired and is no longer available.' });
    }

    // Generate signed URL (valid 15 min — enough to start download)
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: file.r2_key,
    });
    const signedUrl = await getSignedUrl(r2Client, command, { expiresIn: 900 });

    // Respond first, then delete asynchronously (fire-and-forget)
    res.status(200).json({
      filename: file.filename,
      size: file.size,
      signedUrl,
      createdAt: file.created_at,
      expiresAt: file.expires_at,
    });

    // Delete file from R2 + Supabase after responding (one-time download)
    setImmediate(() => cleanupFile(file));

  } catch (err) {
    console.error('Download error:', err);
    return res.status(500).json({ error: 'Failed to retrieve file', detail: err.message });
  }
});

async function cleanupFile(file) {
  try {
    // Delete from Cloudflare R2
    await r2Client.send(new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: file.r2_key,
    }));
    // Delete record from Supabase
    await supabase.from('files').delete().eq('id', file.id);
    console.log(`🗑 Deleted file: ${file.filename} (ID: ${file.id})`);
  } catch (err) {
    console.error('Cleanup error:', err.message);
  }
}

export default router;
