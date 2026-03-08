import { S3Client } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// BUG FIX: use absolute path relative to THIS file, not CWD
// Previously '../.env' resolved relative to where the process was _started_ from,
// not where s3.js lives — causing "injecting env (0)" when run from project root.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') }); // server/ → P2Pshare/.env

const accountId = process.env.CF_R2_ACCOUNT_ID;
const accessKeyId = process.env.CF_R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.CF_R2_SECRET_ACCESS_KEY;

if (!accountId || !accessKeyId || !secretAccessKey) {
  throw new Error('Missing Cloudflare R2 environment variables (CF_R2_ACCOUNT_ID, CF_R2_ACCESS_KEY_ID, CF_R2_SECRET_ACCESS_KEY)');
}

const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

export const BUCKET_NAME = process.env.CF_R2_BUCKET_NAME || 'p2pshare-files';

export default r2Client;
