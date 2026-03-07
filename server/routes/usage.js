import express from 'express';
import supabase from '../supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

export const FREE_LIMIT_BYTES = 8 * 1024 * 1024 * 1024; // 8 GB

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// GET /api/usage
router.get('/', requireAuth, async (req, res) => {
  try {
    const month = currentMonth();
    const { data } = await supabase
      .from('user_usage')
      .select('bytes_used')
      .eq('user_id', req.user.id)
      .eq('month', month)
      .maybeSingle(); // BUG FIX: maybeSingle() doesn't throw if row missing (single() does)

    const bytesUsed = data?.bytes_used ?? 0;
    return res.json({
      bytesUsed,
      freeLimit: FREE_LIMIT_BYTES,
      month,
      percentage: Math.min((bytesUsed / FREE_LIMIT_BYTES) * 100, 100).toFixed(1),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch usage' });
  }
});

// Internal: increment usage after upload
// BUG FIX: use upsert with onConflict to avoid unique constraint errors
export async function incrementUsage(userId, bytes) {
  const month = currentMonth();

  // Fetch current
  const { data: existing } = await supabase
    .from('user_usage')
    .select('id, bytes_used')
    .eq('user_id', userId)
    .eq('month', month)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('user_usage')
      .update({
        bytes_used: existing.bytes_used + bytes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
  } else {
    // Insert — if concurrent race inserts first, ignore error
    await supabase.from('user_usage').insert({
      user_id: userId,
      bytes_used: bytes,
      month,
      updated_at: new Date().toISOString(),
    });
  }
}

// Internal: check if user is within free limit
export async function checkUsageLimit(userId, fileBytes) {
  const month = currentMonth();
  const { data } = await supabase
    .from('user_usage')
    .select('bytes_used')
    .eq('user_id', userId)
    .eq('month', month)
    .maybeSingle(); // BUG FIX: was .single() which throws error when no row exists yet

  const used = data?.bytes_used ?? 0;
  return {
    allowed: used + fileBytes <= FREE_LIMIT_BYTES,
    used,
    remaining: Math.max(FREE_LIMIT_BYTES - used, 0),
  };
}

export default router;
