import { useMemo } from 'react';
import { LayerCard, Tabs } from '@cloudflare/kumo';
import { Popover } from '@cloudflare/kumo/primitives/popover';
import type { HistogramBucket, SeverityCounts, TimeRange } from '../types';
import { SEVERITY_LEVELS, TIME_RANGE_CONFIGS, VALID_TIME_RANGES } from '../types';

interface ActivityHistogramProps {
  data: HistogramBucket[];
  bucketMinutes: number;
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
  onBucketClick?: (from: string, to: string) => void;
  height?: number;
}

// Severity levels ordered from bottom to top of stacked bar
// Critical/high severity at bottom, debug at top
const SEVERITY_ORDER: (keyof SeverityCounts)[] = [
  'emergency', 'alert', 'critical', 'error', 'warning', 'notice', 'info', 'debug'
];

// Map severity names to their numeric levels for color lookup
const SEVERITY_NAME_TO_LEVEL: Record<keyof SeverityCounts, number> = {
  emergency: 0,
  alert: 1,
  critical: 2,
  error: 3,
  warning: 4,
  notice: 5,
  info: 6,
  debug: 7,
};

// Helper to compute the interval start time based on bucket size.
// Handles both "HH:MM" (short ranges) and "MM/DD HH:MM" (multi-day ranges).
function getIntervalStart(hour: string, bucketMinutes: number): string {
  const parts = hour.split(' ');
  const timePart = parts[parts.length - 1]; // "HH:MM" portion
  const [h, m] = timePart.split(':').map(Number);
  const totalMinutesFromMidnight = h * 60 + m - bucketMinutes;

  if (parts.length === 1) {
    // Short format: just return adjusted HH:MM (may wrap across midnight, keep simple)
    const newHour = Math.floor(((totalMinutesFromMidnight % (24 * 60)) + 24 * 60) / 60) % 24;
    const newMinute = ((totalMinutesFromMidnight % 60) + 60) % 60;
    return `${newHour.toString().padStart(2, '0')}:${newMinute.toString().padStart(2, '0')}`;
  }

  // Multi-day format "MM/DD HH:MM": parse with a reference year to handle day rollover
  const datePart = parts[0]; // "MM/DD"
  const [month, day] = datePart.split('/').map(Number);
  const ref = new Date(Date.UTC(new Date().getUTCFullYear(), month - 1, day, h, m, 0));
  ref.setUTCMinutes(ref.getUTCMinutes() - bucketMinutes);
  const mm = (ref.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = ref.getUTCDate().toString().padStart(2, '0');
  const hh = ref.getUTCHours().toString().padStart(2, '0');
  const mn = ref.getUTCMinutes().toString().padStart(2, '0');
  return `${mm}/${dd} ${hh}:${mn}`;
}

// Time range tabs configuration
const TIME_RANGE_TABS = VALID_TIME_RANGES.map(range => ({
  value: range,
  label: TIME_RANGE_CONFIGS[range].label,
}));

// Format bucket size for display
function formatBucketSize(minutes: number): string {
  if (minutes >= 60) {
    const hours = minutes / 60;
    return `${hours}hr`;
  }
  return `${minutes}min`;
}

// Format time range label for the legend
function formatTimeRangeLabel(range: TimeRange): string {
  switch (range) {
    case '8h': return '8h ago';
    case '24h': return '24h ago';
    case '5d': return '5d ago';
    case '21d': return '21d ago';
  }
}

// Compute actual Date range for a histogram bucket based on its position
function computeBucketTimeRange(
  barIndex: number,
  totalBars: number,
  bucketMinutes: number
): { from: Date; to: Date } {
  const now = new Date();
  
  // Align "now" to the current bucket boundary
  const minutes = now.getMinutes();
  const alignedMinutes = Math.floor(minutes / bucketMinutes) * bucketMinutes;
  const alignedNow = new Date(now);
  alignedNow.setMinutes(alignedMinutes, 0, 0);
  
  // bars[0] is oldest, bars[totalBars-1] is most recent (closest to now)
  const bucketsFromNow = totalBars - 1 - barIndex;
  
  // The bucket start is bucketsFromNow intervals before alignedNow
  const bucketEnd = new Date(alignedNow.getTime() - bucketsFromNow * bucketMinutes * 60 * 1000);
  const bucketStart = new Date(bucketEnd.getTime() - bucketMinutes * 60 * 1000);

  return { from: bucketStart, to: bucketEnd };
}

export function ActivityHistogram({ data, bucketMinutes, timeRange, onTimeRangeChange, onBucketClick, height = 80 }: ActivityHistogramProps) {
  const { maxCount, bars } = useMemo(() => {
    const max = Math.max(...data.map(b => b.count), 1);
    const barsData = data.map((bucket, index) => ({
      ...bucket,
      percentage: (bucket.count / max) * 100,
      index,
    }));
    return { maxCount: max, bars: barsData };
  }, [data]);

  const handleBarClick = (bar: typeof bars[number]) => {
    if (!onBucketClick) return;
    
    const { from, to } = computeBucketTimeRange(bar.index, bars.length, bucketMinutes);
    onBucketClick(from.toISOString(), to.toISOString());
  };

  const availableHeight = height - 8;

  return (
    <LayerCard>
      <LayerCard.Secondary className="flex items-center justify-between">
        <Tabs
          variant="segmented"
          tabs={TIME_RANGE_TABS}
          value={timeRange}
          onValueChange={(v) => onTimeRangeChange(v as TimeRange)}
        />
        <span className="text-xs text-kumo-subtle">
          Peak: {maxCount.toLocaleString()} logs/{formatBucketSize(bucketMinutes)}
        </span>
      </LayerCard.Secondary>
      
      <LayerCard.Primary className="p-3">
        <div 
          className="relative bg-kumo-base rounded flex items-end gap-[2px]"
          style={{ height: `${height}px` }}
        >
          {bars.map((bar) => {
            const totalBarHeight = (bar.percentage / 100) * availableHeight;
            
            // Build stacked segments from bottom to top
            const segments: Array<{
              severity: keyof SeverityCounts;
              height: number;
              color: string;
              count: number;
            }> = [];
            
            if (bar.bySeverity && bar.count > 0) {
              for (const severity of SEVERITY_ORDER) {
                const count = bar.bySeverity[severity] || 0;
                if (count > 0) {
                  const segmentHeight = (count / bar.count) * totalBarHeight;
                  const level = SEVERITY_NAME_TO_LEVEL[severity];
                  segments.push({
                    severity,
                    height: segmentHeight,
                    color: SEVERITY_LEVELS[level]?.color || '#6B7280',
                    count,
                  });
                }
              }
            } else if (bar.count > 0) {
              // Fallback if no severity data
              segments.push({
                severity: 'info',
                height: totalBarHeight,
                color: '#0066FF',
                count: bar.count,
              });
            }
            
            // Get severity entries for the popover
            const severityEntries = bar.bySeverity
              ? SEVERITY_ORDER.filter(s => bar.bySeverity[s] > 0).map(s => ({
                  name: s,
                  count: bar.bySeverity[s],
                  color: SEVERITY_LEVELS[SEVERITY_NAME_TO_LEVEL[s]]?.color || '#6B7280',
                }))
              : [];

            const intervalStart = getIntervalStart(bar.hour, bucketMinutes);
            
            return (
              <Popover.Root key={bar.index}>
                <Popover.Trigger
                  openOnHover
                  delay={100}
                  onClick={() => handleBarClick(bar)}
                  className="flex-1 flex flex-col justify-end cursor-pointer min-w-0 hover:opacity-80 transition-opacity"
                  style={{ height: `${height - 8}px` }}
                >
                  {segments.map((segment, segIdx) => (
                    <div
                      key={`${bar.index}-${segment.severity}`}
                      className="w-full"
                      style={{ 
                        height: `${Math.max(segment.height, segIdx === 0 ? 1 : 0)}px`,
                        backgroundColor: segment.color,
                        borderTopLeftRadius: segIdx === 0 ? 2 : 0,
                        borderTopRightRadius: segIdx === 0 ? 2 : 0,
                        borderBottomLeftRadius: 0,
                        borderBottomRightRadius: 0,
                      }}
                    />
                  ))}
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Positioner side="bottom" align="center" collisionPadding={8} sideOffset={8}>
                    <Popover.Popup className="min-w-[160px] flex flex-col rounded-lg bg-kumo-elevated px-4 py-3 text-sm shadow-lg border border-kumo-line">
                      <Popover.Title className="text-sm font-semibold text-kumo-default">
                        {intervalStart} - {bar.hour}
                      </Popover.Title>
                      <Popover.Description className="text-sm text-kumo-strong">
                        <span className="font-medium">{bar.count.toLocaleString()}</span> events
                      </Popover.Description>
                      {severityEntries.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {severityEntries.map(({ name, count, color }) => (
                            <div key={name} className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-1.5">
                                <div 
                                  className="w-2 h-2 rounded-sm" 
                                  style={{ backgroundColor: color }}
                                />
                                <span className="capitalize text-kumo-subtle">{name}</span>
                              </div>
                              <span className="font-medium text-kumo-default">{count.toLocaleString()}</span>
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
          <span>{data[0]?.hour || ''}</span>
          <span>{data[Math.floor(data.length / 2)]?.hour || ''}</span>
          <span>{data[data.length - 1]?.hour || ''}</span>
        </div>
      
      {/* Legend */}
      <div className="flex items-center justify-between mt-4">
        <div className="flex flex-wrap gap-3 text-xs">
          {SEVERITY_ORDER.filter(s => ['error', 'warning', 'notice', 'info', 'debug'].includes(s)).map(severity => {
            const level = SEVERITY_NAME_TO_LEVEL[severity];
            const info = SEVERITY_LEVELS[level];
            return (
              <div key={severity} className="flex items-center gap-1">
                <div 
                  className="w-3 h-3 rounded-sm" 
                  style={{ backgroundColor: info.color }}
                />
                <span className="text-kumo-subtle capitalize">{severity}</span>
              </div>
            );
          })}
        </div>
        <div className="text-xs text-kumo-subtle">
          <span>{formatTimeRangeLabel(timeRange)}</span>
          <span className="mx-2">→</span>
          <span>Now</span>
        </div>
      </div>
      </LayerCard.Primary>
    </LayerCard>
  );
}

// Alternative horizontal bar view for small screens
export function ActivityHistogramCompact({ data }: { data: HistogramBucket[] }) {
  const totalCount = data.reduce((sum, b) => sum + b.count, 0);
  const maxCount = Math.max(...data.map(b => b.count), 1);
  
  // Get the last 6 hours for compact view
  const recentData = data.slice(-6);
  
  return (
    <div className="space-y-1">
      {recentData.map((bucket, index) => {
        const totalWidth = (bucket.count / maxCount) * 100;
        
        // Build segments for stacked horizontal bar
        const segments: Array<{ severity: keyof SeverityCounts; width: number; color: string }> = [];
        if (bucket.bySeverity && bucket.count > 0) {
          for (const severity of SEVERITY_ORDER) {
            const count = bucket.bySeverity[severity] || 0;
            if (count > 0) {
              const segmentWidth = (count / bucket.count) * totalWidth;
              const level = SEVERITY_NAME_TO_LEVEL[severity];
              segments.push({
                severity,
                width: segmentWidth,
                color: SEVERITY_LEVELS[level]?.bgColor || '#6B7280',
              });
            }
          }
        }
        
        return (
          <div key={index} className="flex items-center gap-2">
            <span className="text-xs text-kumo-subtle w-12">{bucket.hour}</span>
            <div className="flex-1 h-3 bg-kumo-fill rounded overflow-hidden flex">
              {segments.length > 0 ? (
                segments.map((segment, segIdx) => (
                  <div
                    key={`${index}-${segment.severity}`}
                    className="h-full"
                    style={{ 
                      width: `${segment.width}%`,
                      backgroundColor: segment.color,
                      borderTopLeftRadius: segIdx === 0 ? '0.25rem' : 0,
                      borderBottomLeftRadius: segIdx === 0 ? '0.25rem' : 0,
                      borderTopRightRadius: segIdx === segments.length - 1 ? '0.25rem' : 0,
                      borderBottomRightRadius: segIdx === segments.length - 1 ? '0.25rem' : 0,
                    }}
                  />
                ))
              ) : (
                <div
                  className="h-full bg-blue-600 rounded"
                  style={{ width: `${totalWidth}%` }}
                />
              )}
            </div>
            <span className="text-xs text-kumo-subtle w-12 text-right">
              {bucket.count}
            </span>
          </div>
        );
      })}
      <div className="text-xs text-kumo-inactive text-center mt-2">
        Total: {totalCount.toLocaleString()} logs in last 24h
      </div>
    </div>
  );
}
