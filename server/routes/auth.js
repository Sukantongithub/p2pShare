import express from 'express';
import supabase from '../supabase.js';

const router = express.Router();

// POST /api/auth/verify - Verify a Supabase JWT and return user info
router.post('/verify', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing Authorization header' });
    }
    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    return res.status(200).json({ user: { id: user.id, email: user.email } });
  } catch (err) {
    return res.status(500).json({ error: 'Verification failed' });
  }
});

export default router;
