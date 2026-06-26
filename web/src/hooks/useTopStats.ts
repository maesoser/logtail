import { useState, useEffect, useCallback, useMemo } from 'react';
import type { TopStats, LogFilter, TimeRange } from '../types';

const API_BASE = '';

export function useTopStats(filter?: LogFilter, timeRange: TimeRange = '24h', limit = 10) {
  const [data, setData] = useState<TopStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Memoize filter to prevent unnecessary refetches
  const filterKey = useMemo(() => {
    const parts: string[] = [`l:${limit}`, `r:${timeRange}`];
    if (filter?.client?.length) parts.push(`c:${[...filter.client].sort().join(',')}`);
    if (filter?.hostname?.length) parts.push(`h:${[...filter.hostname].sort().join(',')}`);
    if (filter?.tag?.length) parts.push(`t:${[...filter.tag].sort().join(',')}`);
    if (filter?.content) parts.push(`q:${filter.content}`);
    if (filter?.severity?.length) parts.push(`s:${[...filter.severity].sort().join(',')}`);
    if (filter?.from) parts.push(`f:${filter.from}`);
    if (filter?.to) parts.push(`e:${filter.to}`);
    return parts.join('|');
  }, [filter, limit, timeRange]);

  const fetchTopStats = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.append('limit', limit.toString());
      params.append('range', timeRange);

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

      const response = await fetch(`${API_BASE}/api/top?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch top stats: ${response.statusText}`);
      }

      const result: TopStats = await response.json();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [filterKey]);

  useEffect(() => {
    fetchTopStats();
  }, [fetchTopStats]);

  // Trigger a fresh filtered fetch when the WebSocket signals new data arrived.
  // This avoids blindly applying the server-pushed (unfiltered) top_stats payload,
  // which would reset the sidebar whenever a log arrives while filters are active.
  const triggerRefetch = useCallback(() => {
    fetchTopStats();
  }, [fetchTopStats]);

  return { data, loading, error, refetch: fetchTopStats, triggerRefetch };
}
