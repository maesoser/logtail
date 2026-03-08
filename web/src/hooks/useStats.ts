import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Stats } from '../types';

const API_BASE = '';

interface StatsFilter {
  severity?: number[];
}

export function useStats(refreshInterval = 30000, filter?: StatsFilter) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Memoize filter to prevent unnecessary refetches
  const filterKey = useMemo(() => {
    if (!filter?.severity?.length) return '';
    return filter.severity.sort().join(',');
  }, [filter?.severity]);

  const fetchStats = useCallback(async () => {
    try {
      // Build URL with severity filter if provided
      const params = new URLSearchParams();
      if (filter?.severity?.length) {
        filter.severity.forEach(s => params.append('severity', s.toString()));
      }
      const url = params.toString() 
        ? `${API_BASE}/api/stats?${params.toString()}`
        : `${API_BASE}/api/stats`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch stats: ${response.statusText}`);
      }

      const data: Stats = await response.json();
      setStats(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [filterKey]);

  useEffect(() => {
    fetchStats();

    // Set up interval for refreshing stats
    const interval = setInterval(fetchStats, refreshInterval);

    return () => {
      clearInterval(interval);
    };
  }, [fetchStats, refreshInterval]);

  return { stats, loading, error, refetch: fetchStats };
}

export function useUniqueValues(field: string) {
  const [values, setValues] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchValues = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/values?field=${field}`);
        if (response.ok) {
          const data = await response.json();
          setValues(data.values || []);
        }
      } catch {
        // Silently fail for filter values
      } finally {
        setLoading(false);
      }
    };

    fetchValues();
  }, [field]);

  return { values, loading };
}
