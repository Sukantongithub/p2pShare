import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '';
const FREE_LIMIT = 8 * 1024 * 1024 * 1024; // 8 GB

export function useUsage() {
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchUsage = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }
      const { data } = await axios.get(`${API_BASE}/api/usage`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      setUsage(data);
    } catch {
      setUsage({ bytesUsed: 0, freeLimit: FREE_LIMIT, percentage: '0.0' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsage(); }, [fetchUsage]);

  return { usage, loading, refetch: fetchUsage };
}
