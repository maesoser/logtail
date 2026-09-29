import { useState, useEffect, useCallback } from 'react';
import type { Stats, TimeRange } from '../types';

const API_BASE = '';

export function useHostnameStats(hostnames: string[], timeRange: TimeRange) {
  const [statsByHostname, setStatsByHostname] = useState<Record<string, Stats>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (hostnames.length === 0) {
      setStatsByHostname({});
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const results = await Promise.all(
        hostnames.map(async (hostname) => {
          const params = new URLSearchParams({ range: timeRange, hostname });
          const response = await fetch(`${API_BASE}/api/stats?${params}`);
          if (!response.ok) {
            throw new Error(`Failed to fetch stats for ${hostname}: ${response.statusText}`);
          }
          const data: Stats = await response.json();
          return [hostname, data] as const;
        })
      );

      setStatsByHostname(Object.fromEntries(results));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [hostnames.join(','), timeRange]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return { statsByHostname, loading, error, refetch: fetchAll };
}
