import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Stats, LogFilter } from '../types';

const API_BASE = '';

export function useStats(refreshInterval = 30000, filter?: LogFilter) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Memoize filter to prevent unnecessary refetches
  const filterKey = useMemo(() => {
    if (!filter) return '';
    const parts: string[] = [];
    if (filter.client?.length) parts.push(`c:${filter.client.sort().join(',')}`);
    if (filter.hostname?.length) parts.push(`h:${filter.hostname.sort().join(',')}`);
    if (filter.tag?.length) parts.push(`t:${filter.tag.sort().join(',')}`);
    if (filter.content) parts.push(`q:${filter.content}`);
    if (filter.severity?.length) parts.push(`s:${filter.severity.sort().join(',')}`);
    if (filter.from) parts.push(`f:${filter.from}`);
    if (filter.to) parts.push(`e:${filter.to}`);
    return parts.join('|');
  }, [filter]);

  const fetchStats = useCallback(async () => {
    try {
      // Build URL with all filter parameters
      const params = new URLSearchParams();
      if (filter?.client?.length) {
        filter.client.forEach(c => params.append('client', c));
      }
      if (filter?.hostname?.length) {
        filter.hostname.forEach(h => params.append('hostname', h));
      }
      if (filter?.tag?.length) {
        filter.tag.forEach(t => params.append('tag', t));
      }
      if (filter?.content) {
        params.append('content', filter.content);
      }
      if (filter?.severity?.length) {
        filter.severity.forEach(s => params.append('severity', s.toString()));
      }
      if (filter?.from) {
        params.append('from', filter.from);
      }
      if (filter?.to) {
        params.append('to', filter.to);
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
