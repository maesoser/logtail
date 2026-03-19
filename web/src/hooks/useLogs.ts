import { useState, useEffect, useCallback, useRef } from 'react';
import type { LogEntry, LogFilter, LogQueryResult, TopStats } from '../types';

const API_BASE = '';

export function useLogs(filter: LogFilter) {
  const [data, setData] = useState<LogQueryResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (filter.client?.length) {
        filter.client.forEach(c => params.append('client', c));
      }
      if (filter.hostname?.length) {
        filter.hostname.forEach(h => params.append('hostname', h));
      }
      if (filter.tag?.length) {
        filter.tag.forEach(t => params.append('tag', t));
      }
      if (filter.content) params.set('content', filter.content);
      if (filter.severity?.length) {
        filter.severity.forEach(s => params.append('severity', s.toString()));
      }
      if (filter.from) params.set('from', filter.from);
      if (filter.to) params.set('to', filter.to);
      if (filter.page) params.set('page', filter.page.toString());
      if (filter.limit) params.set('limit', filter.limit.toString());

      const response = await fetch(`${API_BASE}/api/logs?${params}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch logs: ${response.statusText}`);
      }

      const result: LogQueryResult = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return { data, loading, error, refetch: fetchLogs };
}

interface WebSocketCallbacks {
  onLogEntry: (entry: LogEntry) => void;
  onTopStats?: (topStats: TopStats) => void;
}

export function useWebSocket({ onLogEntry, onTopStats }: WebSocketCallbacks) {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setConnected(true);
        setError(null);
        console.log('WebSocket connected');
      };

      ws.onmessage = (event) => {
        try {
          // Handle multiple messages separated by newlines
          const messages = event.data.split('\n').filter(Boolean);
          for (const msgStr of messages) {
            const message = JSON.parse(msgStr);
            if (message.type === 'log_entry') {
              onLogEntry(message.payload as LogEntry);
            } else if (message.type === 'top_stats' && onTopStats) {
              onTopStats(message.payload as TopStats);
            }
          }
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      ws.onerror = (event) => {
        console.error('WebSocket error:', event);
        setError('WebSocket connection error');
      };

      ws.onclose = () => {
        setConnected(false);
        console.log('WebSocket disconnected');

        // Attempt to reconnect after 3 seconds
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('Attempting to reconnect...');
          connect();
        }, 3000);
      };

      wsRef.current = ws;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
    }
  }, [onLogEntry, onTopStats]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return { connected, error, reconnect: connect };
}
