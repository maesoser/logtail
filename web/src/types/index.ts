// Log entry from the backend
export interface LogEntry {
  id: number;
  client: string;
  facility: number;
  hostname: string;
  priority: number;
  severity: number;
  tag: string;
  timestamp: string;
  content: string;
}

// Filter parameters for querying logs
export interface LogFilter {
  client?: string[];    // Array of clients to filter by
  hostname?: string[];  // Array of hostnames to filter by
  tag?: string[];       // Array of tags to filter by
  content?: string;
  severity?: number[];  // Array of severity levels to filter by (0-7)
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

// Response from the logs endpoint
export interface LogQueryResult {
  entries: LogEntry[];
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Severity counts for histogram buckets
export interface SeverityCounts {
  emergency: number; // 0
  alert: number;     // 1
  critical: number;  // 2
  error: number;     // 3
  warning: number;   // 4
  notice: number;    // 5
  info: number;      // 6
  debug: number;     // 7
}

// Histogram bucket for the 24-hour activity chart
export interface HistogramBucket {
  hour: string;
  count: number;
  bySeverity: SeverityCounts;
}

// Stats from the backend
export interface Stats {
  totalEntries: number;
  bufferSizeBytes: number;  // Maximum buffer size in bytes
  usedSizeBytes: number;    // Current buffer usage in bytes
  oldestTimestamp: string | null;
  newestTimestamp: string | null;
  histogram: HistogramBucket[];
  bucketMinutes: number;    // Size of each histogram bucket in minutes
}

// Time range options for the histogram
export type TimeRange = '8h' | '24h' | '5d' | '21d';

// Time range configuration
export interface TimeRangeConfig {
  value: TimeRange;
  label: string;
  bucketMinutes: number;
  description: string;
}

// Predefined time range configurations
export const TIME_RANGE_CONFIGS: Record<TimeRange, TimeRangeConfig> = {
  '8h': { value: '8h', label: '8 Hours', bucketMinutes: 5, description: '5-min buckets' },
  '24h': { value: '24h', label: '24 Hours', bucketMinutes: 15, description: '15-min buckets' },
  '5d': { value: '5d', label: '5 Days', bucketMinutes: 60, description: '1-hour buckets' },
  '21d': { value: '21d', label: '21 Days', bucketMinutes: 180, description: '3-hour buckets' },
};

// Valid time range values for validation
export const VALID_TIME_RANGES: TimeRange[] = ['8h', '24h', '5d', '21d'];

// Check if a string is a valid time range
export function isValidTimeRange(value: string): value is TimeRange {
  return VALID_TIME_RANGES.includes(value as TimeRange);
}

// Top value item for stats sidebar
export interface TopValueItem {
  value: string;
  count: number;
}

// Top severity item for stats sidebar
export interface TopSeverityItem {
  level: number;
  name: string;
  count: number;
}

// Top stats response from /api/top
export interface TopStats {
  hostnames: TopValueItem[];
  tags: TopValueItem[];
  clients: TopValueItem[];
  severities: TopSeverityItem[];
  total: number;
}

// WebSocket message types
export interface WebSocketMessage {
  type: 'log_entry' | 'stats' | 'top_stats';
  payload: LogEntry | Stats | TopStats;
}

// Column configuration for the log table
export interface ColumnConfig {
  key: keyof LogEntry;
  label: string;
  visible: boolean;
  width?: string;
  monospace?: boolean;
}

// Default columns configuration
export const DEFAULT_COLUMNS: ColumnConfig[] = [
  { key: 'timestamp', label: 'Timestamp', visible: true, width: '145px' },
  { key: 'severity', label: 'Severity', visible: true, width: '80px' },
  { key: 'hostname', label: 'Hostname', visible: true, width: '120px' },
  { key: 'client', label: 'Client', visible: false, width: '110px' },
  { key: 'tag', label: 'Tag', visible: true, width: '100px' },
  { key: 'facility', label: 'Facility', visible: false, width: '60px' },
  { key: 'priority', label: 'Priority', visible: false, width: '60px' },
  { key: 'content', label: 'Content', visible: true, monospace: true },
];

// Syslog facility names (RFC 3164)
export const FACILITY_NAMES: Record<number, string> = {
  0:  'kern',
  1:  'user',
  2:  'mail',
  3:  'daemon',
  4:  'authpriv',
  5:  'syslogd',
  6:  'printer',
  7:  'network',
  8:  'UUCP',
  9:  'cron',
  10: 'auth',
  11: 'ftp',
  12: 'ntp',
  13: 'audit',
  14: 'alert',
  15: 'cron',
  16: 'local0',
  17: 'local1',
  18: 'local2',
  19: 'local3',
  20: 'local4',
  21: 'local5',
  22: 'local6',
  23: 'local7',
};

// Get facility name with numeric fallback
export function getFacilityName(facility: number): string {
  return FACILITY_NAMES[facility] ?? String(facility);
}

// Severity level names and colors (via CSS custom properties — adapts to light/dark mode)
export const SEVERITY_LEVELS: Record<number, { name: string; color: string; bgColor: string }> = {
  0: { name: 'emergency', color: 'var(--color-severity-emergency)',    bgColor: 'var(--color-severity-emergency-bg)' },
  1: { name: 'alert',     color: 'var(--color-severity-alert)',        bgColor: 'var(--color-severity-alert-bg)' },
  2: { name: 'critical',  color: 'var(--color-severity-critical)',     bgColor: 'var(--color-severity-critical-bg)' },
  3: { name: 'error',     color: 'var(--color-severity-error)',        bgColor: 'var(--color-severity-error-bg)' },
  4: { name: 'warning',   color: 'var(--color-severity-warning)',      bgColor: 'var(--color-severity-warning-bg)' },
  5: { name: 'notice',    color: 'var(--color-severity-notice)',       bgColor: 'var(--color-severity-notice-bg)' },
  6: { name: 'info',      color: 'var(--color-severity-info)',         bgColor: 'var(--color-severity-info-bg)' },
  7: { name: 'debug',     color: 'var(--color-severity-debug)',        bgColor: 'var(--color-severity-debug-bg)' },
};

// Get severity info with fallback
export function getSeverityInfo(level: number): { name: string; color: string; bgColor: string } {
  return SEVERITY_LEVELS[level] ?? { name: 'unknown', color: 'var(--color-severity-unknown)', bgColor: 'var(--color-severity-unknown-bg)' };
}

// Format timestamp for display
export function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);

  const datePart = date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const timePart = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  return `${datePart} ${timePart}`;
}

// Format relative time
export function formatRelativeTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) return `${diffDays}d ago`;
  if (diffHours > 0) return `${diffHours}h ago`;
  if (diffMins > 0) return `${diffMins}m ago`;
  return `${diffSecs}s ago`;
}
