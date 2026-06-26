import { LayerCard, Button, Tabs, Loader } from '@cloudflare/kumo';
import {
  XIcon,
  DatabaseIcon,
  ArrowsClockwiseIcon,
  MagnifyingGlassIcon,
  WifiHighIcon,
  ClockIcon,
  ChartBarIcon,
} from '@phosphor-icons/react';
import { ActivityHistogram } from './ActivityHistogram';
import type { HealthData, LatencyStats, TopStats, Stats, LogFilter, TimeRange } from '../types';
import { VALID_TIME_RANGES, TIME_RANGE_CONFIGS } from '../types';

// ─── helpers ────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

// ─── sub-components ─────────────────────────────────────────────────────────

interface StatTileProps {
  label: string;
  value: string | number;
  sub?: string;
}

function StatTile({ label, value, sub }: StatTileProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-kumo-subtle uppercase tracking-wide">{label}</span>
      <span className="text-xl font-semibold text-kumo-default tabular-nums">{value}</span>
      {sub && <span className="text-xs text-kumo-subtle">{sub}</span>}
    </div>
  );
}

interface LatencyCardProps {
  title: string;
  icon: React.ReactNode;
  stats: LatencyStats;
}

function LatencyCard({ title, icon, stats }: LatencyCardProps) {
  return (
    <LayerCard>
      <LayerCard.Secondary className="flex items-center gap-2">
        <span className="text-kumo-subtle">{icon}</span>
        <span className="text-sm font-medium text-kumo-default">{title}</span>
      </LayerCard.Secondary>
      <LayerCard.Primary className="p-4">
        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          <StatTile label="avg" value={`${stats.avgMs}ms`} />
          <StatTile label="requests" value={stats.count.toLocaleString()} />
          <StatTile label="min" value={`${stats.minMs}ms`} />
          <StatTile label="max" value={`${stats.maxMs}ms`} />
        </div>
      </LayerCard.Primary>
    </LayerCard>
  );
}

interface BufferCardProps {
  health: HealthData;
}

function BufferCard({ health }: BufferCardProps) {
  const usedPct = health.bufferSizeBytes > 0
    ? Math.round((health.bufferUsedBytes / health.bufferSizeBytes) * 100)
    : 0;

  // Color the fill bar based on usage level
  const barColor =
    usedPct >= 90 ? 'var(--color-severity-error)' :
    usedPct >= 70 ? 'var(--color-severity-warning)' :
    'var(--color-kumo-brand, #f48120)';

  return (
    <LayerCard>
      <LayerCard.Secondary className="flex items-center gap-2">
        <span className="text-kumo-subtle"><DatabaseIcon size={14} /></span>
        <span className="text-sm font-medium text-kumo-default">Buffer</span>
      </LayerCard.Secondary>
      <LayerCard.Primary className="p-4 space-y-4">
        {/* Usage bar */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-kumo-subtle">
            <span>{formatBytes(health.bufferUsedBytes)} used</span>
            <span className="font-medium text-kumo-default">{usedPct}%</span>
          </div>
          <div className="h-2 rounded-full bg-kumo-fill overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${usedPct}%`, backgroundColor: barColor }}
            />
          </div>
          <div className="text-xs text-kumo-subtle text-right">
            of {formatBytes(health.bufferSizeBytes)} total
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-4 pt-2 border-t border-kumo-line">
          <StatTile
            label="log entries"
            value={health.bufferCount.toLocaleString()}
          />
          <StatTile
            label="ws clients"
            value={health.wsClients}
            sub={health.wsClients === 1 ? '1 viewer' : `${health.wsClients} viewers`}
          />
        </div>
      </LayerCard.Primary>
    </LayerCard>
  );
}

// ─── time range tabs ─────────────────────────────────────────────────────────

const TIME_RANGE_TABS = VALID_TIME_RANGES.map(range => ({
  value: range,
  label: TIME_RANGE_CONFIGS[range].label,
}));

// ─── hostname histogram card ──────────────────────────────────────────────────

interface HostnameCardProps {
  hostname: string;
  stats: Stats;
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
  onFilterBy: (filter: Partial<LogFilter>) => void;
  onClose: () => void;
}

function HostnameCard({ hostname, stats, timeRange, onTimeRangeChange, onFilterBy, onClose }: HostnameCardProps) {
  const handleHostnameClick = () => {
    onFilterBy({ hostname: [hostname] });
    onClose();
  };

  // Sum histogram bucket counts — this reflects logs for this specific hostname
  // in the selected time range. stats.totalEntries is the global buffer count
  // (unfiltered) and must not be used here.
  const hostnameLogCount = stats.histogram.reduce((sum, b) => sum + b.count, 0);

  return (
    <LayerCard>
      <LayerCard.Secondary className="flex items-center justify-between">
        <button
          onClick={handleHostnameClick}
          className="flex items-center gap-1.5 text-sm font-medium text-kumo-default hover:text-kumo-brand transition-colors group"
          title={`Filter logs by ${hostname}`}
        >
          <span>{hostname}</span>
          <MagnifyingGlassIcon
            size={12}
            className="text-kumo-subtle opacity-0 group-hover:opacity-100 transition-opacity"
          />
        </button>
        <span className="text-xs text-kumo-subtle">
          {hostnameLogCount.toLocaleString()} logs
        </span>
      </LayerCard.Secondary>
      <LayerCard.Primary className="p-3">
        {stats.histogram.length > 0 ? (
          <ActivityHistogram
            data={stats.histogram}
            bucketMinutes={stats.bucketMinutes}
            timeRange={timeRange}
            onTimeRangeChange={onTimeRangeChange}
            hideControls
            height={80}
          />
        ) : (
          <div className="flex items-center justify-center h-20 text-xs text-kumo-subtle">
            No activity in this period
          </div>
        )}
      </LayerCard.Primary>
    </LayerCard>
  );
}

// ─── main panel ──────────────────────────────────────────────────────────────

interface InsightsPanelProps {
  health: HealthData | null;
  healthLoading: boolean;
  topStats: TopStats | null;
  statsByHostname: Record<string, Stats>;
  hostnameStatsLoading: boolean;
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
  onClose: () => void;
  onFilterBy: (filter: Partial<LogFilter>) => void;
}

export function InsightsPanel({
  health,
  healthLoading,
  topStats,
  statsByHostname,
  hostnameStatsLoading,
  timeRange,
  onTimeRangeChange,
  onClose,
  onFilterBy,
}: InsightsPanelProps) {
  const hostnames = topStats?.hostnames.slice(0, 10).map(h => h.value) ?? [];

  return (
    <div className="fixed inset-0 z-20 bg-kumo-base overflow-y-auto">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-kumo-base border-b border-kumo-line px-4 md:px-6 py-3 md:py-4 flex items-center justify-between">
        <div className="flex items-center gap-2 md:gap-3">
          <ChartBarIcon size={20} className="text-kumo-brand" />
          <h2 className="text-lg md:text-xl font-medium text-kumo-default">Insights</h2>
        </div>
        <Button
          variant="outline"
          shape="square"
          onClick={onClose}
          aria-label="Close insights"
        >
          <XIcon size={16} />
        </Button>
      </header>

      <div className="mx-auto max-w-7xl px-4 md:px-6 py-6 space-y-8">

        {/* ── System Health ─────────────────────────────────── */}
        <section className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-kumo-subtle">
            System Health
          </h3>

          {healthLoading && !health ? (
            <div className="flex items-center gap-2 text-sm text-kumo-subtle">
              <Loader size="sm" />
              <span>Loading health data…</span>
            </div>
          ) : health ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <BufferCard health={health} />
              <LatencyCard
                title="Ingest Latency"
                icon={<ArrowsClockwiseIcon size={14} />}
                stats={health.latency.ingest}
              />
              <LatencyCard
                title="Query Latency"
                icon={<MagnifyingGlassIcon size={14} />}
                stats={health.latency.query}
              />
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-kumo-subtle">
              <WifiHighIcon size={16} />
              <span>Health data unavailable</span>
            </div>
          )}
        </section>

        {/* ── Activity by Hostname ──────────────────────────── */}
        <section className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-kumo-subtle">
              Activity by Hostname
              {hostnames.length > 0 && (
                <span className="ml-2 normal-case font-normal text-kumo-inactive">
                  (top {hostnames.length})
                </span>
              )}
            </h3>
            <Tabs
              variant="segmented"
              tabs={TIME_RANGE_TABS}
              value={timeRange}
              onValueChange={(v) => onTimeRangeChange(v as TimeRange)}
            />
          </div>

          {hostnames.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-kumo-subtle gap-2">
              <ClockIcon size={32} />
              <span className="text-sm">No hostnames found yet</span>
            </div>
          ) : hostnameStatsLoading && Object.keys(statsByHostname).length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-kumo-subtle">
              <Loader size="sm" />
              <span>Loading hostname activity…</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {hostnames.map(hostname => {
                const stats = statsByHostname[hostname];
                if (!stats) return null;
                return (
                  <HostnameCard
                    key={hostname}
                    hostname={hostname}
                    stats={stats}
                    timeRange={timeRange}
                    onTimeRangeChange={onTimeRangeChange}
                    onFilterBy={onFilterBy}
                    onClose={onClose}
                  />
                );
              })}
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
