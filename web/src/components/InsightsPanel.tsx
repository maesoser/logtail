import { useMemo } from 'react';
import { LayerCard, Button, Tabs, Loader } from '@cloudflare/kumo';
import { Popover } from '@cloudflare/kumo/primitives/popover';
import {
  XIcon,
  DatabaseIcon,
  ArrowsClockwiseIcon,
  MagnifyingGlassIcon,
  WifiHighIcon,
  ClockIcon,
  ChartBarIcon,
} from '@phosphor-icons/react';
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

// ─── hostname color palette ───────────────────────────────────────────────────
// Distinct colors that work on both light and dark backgrounds, intentionally
// different from the severity palette so there's no visual confusion.

const HOSTNAME_COLORS = [
  '#6366f1', // indigo
  '#06b6d4', // cyan
  '#f59e0b', // amber
  '#10b981', // emerald
  '#ec4899', // pink
  '#8b5cf6', // violet
  '#14b8a6', // teal
  '#f97316', // orange
  '#84cc16', // lime
  '#e11d48', // rose
];

function hostnameColor(index: number): string {
  return HOSTNAME_COLORS[index % HOSTNAME_COLORS.length];
}

// ─── hostname histogram ───────────────────────────────────────────────────────

interface HostnameHistogramProps {
  hostnames: string[];
  statsByHostname: Record<string, Stats>;
  timeRange: TimeRange;
  onFilterBy: (filter: Partial<LogFilter>) => void;
  onClose: () => void;
  height?: number;
}

function HostnameHistogram({
  hostnames,
  statsByHostname,
  timeRange,
  onFilterBy,
  onClose,
  height = 120,
}: HostnameHistogramProps) {
  // All hostname Stats share the same bucket timestamps (same range param),
  // so we use the first available histogram as the time axis.
  const referenceStats = useMemo(
    () => hostnames.map(h => statsByHostname[h]).find(s => s && s.histogram.length > 0),
    [hostnames, statsByHostname]
  );

    const { bars, maxCount, timeLabels } = useMemo(() => {
    if (!referenceStats) return { bars: [], maxCount: 1, timeLabels: [] };

    const bucketCount = referenceStats.histogram.length;

    // Build one bar per bucket: array of { hour, total, segments[{hostname, count, color}] }
    const barsData = Array.from({ length: bucketCount }, (_, i) => {
      const hour = referenceStats.histogram[i].hour;
      const segments = hostnames
        .map((hostname, hIdx) => {
          const count = statsByHostname[hostname]?.histogram[i]?.count ?? 0;
          return { hostname, count, color: hostnameColor(hIdx) };
        })
        .filter(s => s.count > 0);
      const total = segments.reduce((sum, s) => sum + s.count, 0);
      return { hour, total, segments, index: i };
    });

    const max = Math.max(...barsData.map(b => b.total), 1);

    const labels = [0, 1, 2, 3, 4].map(
      q => barsData[Math.floor(q * (bucketCount - 1) / 4)]?.hour ?? ''
    );

    return { bars: barsData, maxCount: max, timeLabels: labels };
  }, [hostnames, statsByHostname, referenceStats]);

  const availableHeight = height - 8;

  if (!referenceStats) {
    return (
      <div className="flex items-center justify-center text-xs text-kumo-subtle" style={{ height }}>
        No activity in this period
      </div>
    );
  }

  return (
    <div>
      {/* Bars */}
      <div
        className="relative bg-kumo-base rounded flex items-end gap-[2px]"
        style={{ height: `${height}px` }}
      >
        {bars.map((bar) => {
          const totalBarHeight = (bar.total / maxCount) * availableHeight;

          return (
            <Popover.Root key={bar.index}>
              <Popover.Trigger
                openOnHover
                delay={100}
                className="flex-1 flex flex-col justify-end min-w-0 hover:opacity-80 transition-opacity cursor-default"
                style={{ height: `${availableHeight}px` }}
              >
                {bar.segments.map((seg, segIdx) => {
                  const segHeight = (seg.count / bar.total) * totalBarHeight;
                  const isTop = segIdx === bar.segments.length - 1;
                  return (
                    <div
                      key={seg.hostname}
                      className="w-full"
                      style={{
                        height: `${Math.max(segHeight, segIdx === 0 ? 1 : 0)}px`,
                        backgroundColor: seg.color,
                        borderTopLeftRadius: isTop ? 2 : 0,
                        borderTopRightRadius: isTop ? 2 : 0,
                      }}
                    />
                  );
                })}
                {bar.segments.length === 0 && (
                  <div className="w-full" style={{ height: '1px', backgroundColor: 'transparent' }} />
                )}
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Positioner side="bottom" align="center" collisionPadding={8} sideOffset={8}>
                  <Popover.Popup className="min-w-[180px] flex flex-col rounded-lg bg-kumo-elevated px-4 py-3 text-sm shadow-lg border border-kumo-line">
                    <Popover.Title className="text-sm font-medium text-kumo-default">
                      {bar.hour}
                    </Popover.Title>
                    <Popover.Description className="text-sm text-kumo-strong">
                      <span className="font-medium">{bar.total.toLocaleString()}</span> events
                    </Popover.Description>
                    {bar.segments.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {bar.segments.map(({ hostname, count, color }) => (
                          <div key={hostname} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5">
                              <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
                              <span className="text-kumo-subtle truncate max-w-[120px]">{hostname}</span>
                            </div>
                            <span className="font-medium text-kumo-default ml-2">{count.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </Popover.Popup>
                </Popover.Positioner>
              </Popover.Portal>
            </Popover.Root>
          );
        })}
      </div>

      {/* Time labels */}
      <div className="flex justify-between px-1 text-xs text-kumo-subtle mt-1">
        {timeLabels.map((label, i) => (
          <span key={i}>{label}</span>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-between mt-4">
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
          {hostnames.map((hostname, idx) => (
            <button
              key={hostname}
              onClick={() => { onFilterBy({ hostname: [hostname] }); onClose(); }}
              className="flex items-center gap-1.5 hover:opacity-70 transition-opacity"
              title={`Filter logs by ${hostname}`}
            >
              <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: hostnameColor(idx) }} />
              <span className="text-kumo-subtle">{hostname}</span>
            </button>
          ))}
        </div>
        <div className="text-xs text-kumo-subtle whitespace-nowrap ml-4">
          <span>{TIME_RANGE_CONFIGS[timeRange].label}</span>
          <span className="mx-2">→</span>
          <span>Now</span>
        </div>
      </div>
    </div>
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
            <LayerCard>
              <LayerCard.Primary className="p-4">
                <HostnameHistogram
                  hostnames={hostnames}
                  statsByHostname={statsByHostname}
                  timeRange={timeRange}
                  onFilterBy={onFilterBy}
                  onClose={onClose}
                  height={140}
                />
              </LayerCard.Primary>
            </LayerCard>
          )}
        </section>

      </div>
    </div>
  );
}
