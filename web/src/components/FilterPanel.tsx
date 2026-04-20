import { useState, useEffect, useCallback } from 'react';
import { Input, Button, DatePicker, Popover, Badge, Text, Select, Combobox } from '@cloudflare/kumo';
import { CornerBrackets } from './CornerBrackets';
import { MagnifyingGlassIcon, XIcon, CalendarDotsIcon, FunnelIcon, DatabaseIcon, ClockIcon, WifiHighIcon, WifiSlashIcon } from '@phosphor-icons/react';
import type { LogFilter, Stats } from '../types';
import { SEVERITY_LEVELS, formatRelativeTime } from '../types';

// Date presets
interface DatePreset {
  label: string;
  getRange: () => { from: Date; to: Date };
}

const DATE_PRESETS: DatePreset[] = [
  {
    label: 'Last 30 min',
    getRange: () => {
      const to = new Date();
      const from = new Date(to.getTime() - 30 * 60 * 1000);
      return { from, to };
    },
  },
  {
    label: 'Last 1 hour',
    getRange: () => {
      const to = new Date();
      const from = new Date(to.getTime() - 60 * 60 * 1000);
      return { from, to };
    },
  },
  {
    label: 'Last 6 hours',
    getRange: () => {
      const to = new Date();
      const from = new Date(to.getTime() - 6 * 60 * 60 * 1000);
      return { from, to };
    },
  },
  {
    label: 'Today',
    getRange: () => {
      const from = new Date();
      from.setHours(0, 0, 0, 0);
      const to = new Date();
      to.setHours(23, 59, 59, 999);
      return { from, to };
    },
  },
  {
    label: 'Yesterday',
    getRange: () => {
      const from = new Date();
      from.setDate(from.getDate() - 1);
      from.setHours(0, 0, 0, 0);
      const to = new Date();
      to.setDate(to.getDate() - 1);
      to.setHours(23, 59, 59, 999);
      return { from, to };
    },
  },
  {
    label: 'Last 7 days',
    getRange: () => {
      const to = new Date();
      const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { from, to };
    },
  },
  {
    label: 'Last 30 days',
    getRange: () => {
      const to = new Date();
      const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { from, to };
    },
  },
];

// Pad a number to 2 digits
function pad2(n: number) {
  return String(n).padStart(2, '0');
}

// Parse "HH:MM" string into { hours, minutes }
function parseTime(timeStr: string): { hours: number; minutes: number } {
  const [h, m] = timeStr.split(':').map(Number);
  return { hours: isNaN(h) ? 0 : h, minutes: isNaN(m) ? 0 : m };
}

// Apply HH:MM time to a Date (mutates a copy)
function applyTime(date: Date, timeStr: string): Date {
  const d = new Date(date);
  const { hours, minutes } = parseTime(timeStr);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

// Format a Date as "MMM D, HH:MM"
function formatDateTimeShort(date: Date): string {
  const datePart = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const timePart = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  return `${datePart}, ${timePart}`;
}

// Format a Date as "HH:MM"
function formatTimeInput(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

interface FilterPanelProps {
  filter: LogFilter;
  onFilterChange: (filter: LogFilter) => void;
  uniqueClients?: string[];
  uniqueHostnames?: string[];
  uniqueTags?: string[];
  stats?: Stats | null;
  connected?: boolean;
  realtimeCount?: number;
  isMobile?: boolean;
}

export function FilterPanel({
  filter,
  onFilterChange,
  uniqueClients = [],
  uniqueHostnames = [],
  uniqueTags = [],
  stats,
  connected = false,
  realtimeCount = 0,
  isMobile = false,
}: FilterPanelProps) {
  const [localFilter, setLocalFilter] = useState(filter);
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});
  const [fromTime, setFromTime] = useState('00:00');
  const [toTime, setToTime] = useState('23:59');
  const [isExpanded, setIsExpanded] = useState(false);

  // Debounce content search
  const [debouncedContent, setDebouncedContent] = useState(filter.content || '');
  
  useEffect(() => {
    const timer = setTimeout(() => {
      if (debouncedContent !== localFilter.content) {
        const newFilter = { ...localFilter, content: debouncedContent, page: 1 };
        setLocalFilter(newFilter);
        onFilterChange(newFilter);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [debouncedContent, localFilter, onFilterChange]);

  // Sync local state when filter prop changes (from histogram click, quick filters, etc.)
  useEffect(() => {
    setLocalFilter(filter);
    const from = filter.from ? new Date(filter.from) : undefined;
    const to   = filter.to   ? new Date(filter.to)   : undefined;
    setDateRange({ from, to });
    if (from) setFromTime(formatTimeInput(from));
    if (to)   setToTime(formatTimeInput(to));
    setDebouncedContent(filter.content || '');
  }, [filter]);

  const handleFieldChange = useCallback((field: keyof LogFilter, value: string | string[]) => {
    const isEmpty = Array.isArray(value) ? value.length === 0 : !value;
    const newFilter = { ...localFilter, [field]: isEmpty ? undefined : value, page: 1 };
    setLocalFilter(newFilter);
    
    // For content, use debounced update
    if (field === 'content') {
      setDebouncedContent(value as string);
    } else {
      onFilterChange(newFilter);
    }
  }, [localFilter, onFilterChange]);

  // Core handler — accepts already-time-adjusted Date objects
  const applyDateRange = useCallback((range: { from?: Date; to?: Date } | undefined) => {
    if (!range) {
      setDateRange({});
      setFromTime('00:00');
      setToTime('23:59');
      const newFilter = { ...localFilter, from: undefined, to: undefined, page: 1 };
      setLocalFilter(newFilter);
      onFilterChange(newFilter);
      return;
    }
    setDateRange(range);
    const newFilter = {
      ...localFilter,
      from: range.from?.toISOString(),
      to:   range.to?.toISOString(),
      page: 1,
    };
    setLocalFilter(newFilter);
    onFilterChange(newFilter);
  }, [localFilter, onFilterChange]);

  // Called when the calendar selection changes — preserves current time inputs
  const handleDateRangeChange = useCallback((range: { from?: Date; to?: Date } | undefined) => {
    if (!range) { applyDateRange(undefined); return; }
    const from = range.from ? applyTime(range.from, fromTime) : undefined;
    const to   = range.to   ? applyTime(range.to, toTime)     : undefined;
    applyDateRange({ from, to });
  }, [applyDateRange, fromTime, toTime]);

  // Called when a time input changes
  const handleFromTimeChange = useCallback((newTime: string) => {
    setFromTime(newTime);
    if (dateRange.from) {
      const from = applyTime(dateRange.from, newTime);
      applyDateRange({ from, to: dateRange.to });
    }
  }, [applyDateRange, dateRange]);

  const handleToTimeChange = useCallback((newTime: string) => {
    setToTime(newTime);
    if (dateRange.to) {
      const to = applyTime(dateRange.to, newTime);
      applyDateRange({ from: dateRange.from, to });
    }
  }, [applyDateRange, dateRange]);

  // Called when a preset button is clicked
  const handlePreset = useCallback((preset: DatePreset) => {
    const range = preset.getRange();
    setFromTime(formatTimeInput(range.from));
    setToTime(formatTimeInput(range.to));
    applyDateRange(range);
  }, [applyDateRange]);

  const clearFilters = useCallback(() => {
    const clearedFilter: LogFilter = { page: 1, limit: filter.limit };
    setLocalFilter(clearedFilter);
    setDebouncedContent('');
    setDateRange({});
    setFromTime('00:00');
    setToTime('23:59');
    onFilterChange(clearedFilter);
  }, [filter.limit, onFilterChange]);

  const handleSeverityChange = useCallback((values: string[]) => {
    const newSeverities = values.map(v => parseInt(v, 10)).sort((a, b) => a - b);
    
    const newFilter = { 
      ...localFilter, 
      severity: newSeverities.length > 0 ? newSeverities : undefined, 
      page: 1 
    };
    setLocalFilter(newFilter);
    onFilterChange(newFilter);
  }, [localFilter, onFilterChange]);

  const hasActiveFilters = !!(
    localFilter.client?.length ||
    localFilter.hostname?.length ||
    localFilter.tag?.length ||
    localFilter.content ||
    localFilter.severity?.length ||
    localFilter.from ||
    localFilter.to
  );

  const formatDateRange = () => {
    if (dateRange.from && dateRange.to) {
      return `${formatDateTimeShort(dateRange.from)} – ${formatDateTimeShort(dateRange.to)}`;
    }
    if (dateRange.from) {
      return `From ${formatDateTimeShort(dateRange.from)}`;
    }
    if (dateRange.to) {
      return `Until ${formatDateTimeShort(dateRange.to)}`;
    }
    return 'Select dates';
  };

  const used = stats?.usedSizeBytes ?? 0;
  const total = stats?.bufferSizeBytes ?? 0;

  // Avoid division by zero and format to 1 decimal place
  const usagePercentage = total > 0 
  ? ((used / total) * 100).toFixed(1) 
  : 0;

  return (
    <div className="relative bg-kumo-elevated border border-kumo-line rounded-xl p-3">
      <CornerBrackets />
      {/* Main search bar with stats */}
      <div className={`flex gap-2 md:gap-3 ${isMobile ? 'flex-col' : 'items-center'}`}>
        <div className={`flex gap-2 ${isMobile ? 'w-full' : 'flex-1'}`}>
          <div className="flex-1 relative">
            <MagnifyingGlassIcon
              className="absolute left-3 top-1/2 -translate-y-1/2 text-kumo-subtle" 
              size={16} 
            />
            <Input
              placeholder={isMobile ? "Search..." : "Search log content..."}
              value={debouncedContent}
              onChange={(e) => setDebouncedContent(e.target.value)}
              className="pl-9"
              aria-label="Search log content"
            />
          </div>
          
          <Button
            variant={isExpanded ? 'primary' : 'outline'}
            onClick={() => setIsExpanded(!isExpanded)}
            shape={isMobile ? 'square' : undefined}
            aria-label="Filters"
            className="flex items-center gap-2"
          >
            <FunnelIcon size={16} />
            {!isMobile && 'Filters'}
            {!isMobile && hasActiveFilters && (
              <span className="bg-kumo-brand text-kumo-inverse text-xs rounded-full w-5 h-5 flex items-center justify-center">
                !
              </span>
            )}
          </Button>

          {hasActiveFilters && (
            <Button 
              variant="ghost" 
              onClick={clearFilters} 
              shape={isMobile ? 'square' : undefined}
              aria-label="Clear filters"
              className="text-kumo-subtle"
            >
              <XIcon size={16} />
              {!isMobile && 'Clear'}
            </Button>
          )}
        </div>

        {/* Stats section - right aligned on desktop, full width on mobile */}
        <div className={`flex items-center gap-3 md:gap-4 text-xs ${isMobile ? 'justify-between' : 'ml-auto'}`}>
          {!isMobile && (
            <div className="flex items-center gap-1.5">
              <DatabaseIcon size={14} className="text-kumo-subtle" />
              <Text variant="secondary">
                {stats?.totalEntries?.toLocaleString() ?? 0}{` / ${usagePercentage}%`}
              </Text>
            </div>
          )}

          {stats?.oldestTimestamp && !isMobile && (
            <div className="flex items-center gap-1.5">
              <ClockIcon size={14} className="text-kumo-subtle" />
              <Text variant="secondary">
                {formatRelativeTime(stats.oldestTimestamp)}
              </Text>
            </div>
          )}
          
          {!isMobile && (
          <div className="flex items-center gap-1.5">
            {connected ? (
              <WifiHighIcon size={14} className="text-kumo-success" />
            ) : (
              <WifiSlashIcon size={14} className="text-kumo-subtle" />
            )}
            <Badge variant={connected ? 'primary' : 'secondary'} className="text-xs">
              {connected ? 'Live' : 'Offline'}
            </Badge>
            {realtimeCount > 0 && (
              <Text variant="secondary">
                +{realtimeCount}
              </Text>
            )}
          </div>
          )}
        </div>
      </div>

      {/* Expanded filters */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-kumo-line">
          <div className={`grid gap-3 ${isMobile ? 'grid-cols-1' : 'grid-cols-2 lg:grid-cols-5'}`}>
            {/* Client filter */}
            <div>
              <Combobox
                label="Client"
                items={uniqueClients}
                value={localFilter.client || []}
                onValueChange={(values) => handleFieldChange('client', values as string[])}
                multiple
              >
                <Combobox.TriggerMultipleWithInput
                  placeholder="Filter by client"
                  renderItem={(selected: string) => (
                    <Combobox.Chip key={selected}>{selected}</Combobox.Chip>
                  )}
                />
                <Combobox.Content>
                  <Combobox.Empty />
                  <Combobox.List>
                    {(item: string) => (
                      <Combobox.Item key={item} value={item}>
                        {item}
                      </Combobox.Item>
                    )}
                  </Combobox.List>
                </Combobox.Content>
              </Combobox>
            </div>

            {/* Hostname filter */}
            <div>
              <Combobox
                label="Hostname"
                items={uniqueHostnames}
                value={localFilter.hostname || []}
                onValueChange={(values) => handleFieldChange('hostname', values as string[])}
                multiple
              >
                <Combobox.TriggerMultipleWithInput
                  placeholder="Filter by hostname"
                  renderItem={(selected: string) => (
                    <Combobox.Chip key={selected}>{selected}</Combobox.Chip>
                  )}
                />
                <Combobox.Content>
                  <Combobox.Empty />
                  <Combobox.List>
                    {(item: string) => (
                      <Combobox.Item key={item} value={item}>
                        {item}
                      </Combobox.Item>
                    )}
                  </Combobox.List>
                </Combobox.Content>
              </Combobox>
            </div>

            {/* Tag filter */}
            <div>
              <Combobox
                label="Tag"
                items={uniqueTags}
                value={localFilter.tag || []}
                onValueChange={(values) => handleFieldChange('tag', values as string[])}
                multiple
              >
                <Combobox.TriggerMultipleWithInput
                  placeholder="Filter by tag"
                  renderItem={(selected: string) => (
                    <Combobox.Chip key={selected}>{selected}</Combobox.Chip>
                  )}
                />
                <Combobox.Content>
                  <Combobox.Empty />
                  <Combobox.List>
                    {(item: string) => (
                      <Combobox.Item key={item} value={item}>
                        {item}
                      </Combobox.Item>
                    )}
                  </Combobox.List>
                </Combobox.Content>
              </Combobox>
            </div>

            {/* Severity filter */}
            <div>
              <Select
                label="Severity"
                hideLabel={false}
                multiple
                placeholder="All severities"
                value={localFilter.severity?.map(s => s.toString()) || []}
                onValueChange={(v) => handleSeverityChange(v as string[])}
                renderValue={(values) => {
                  if (values.length === 0) return <span>All severities</span>;
                  if (values.length > 2) {
                    return <span>{values.length} selected</span>;
                  }
                  return (
                    <span className="flex items-center gap-1">
                      {values.map(v => {
                        const level = parseInt(v, 10);
                        const info = SEVERITY_LEVELS[level];
                        return (
                          <span
                            key={v}
                            className="text-xs font-medium px-1 py-0.5 rounded-full"
                            style={{
                              backgroundColor: info.bgColor,
                              color: info.color,
                            }}
                          >
                            {info.name}
                          </span>
                        );
                      })}
                    </span>
                  );
                }}
              >
                {Object.entries(SEVERITY_LEVELS).map(([level, info]) => (
                  <Select.Option key={level} value={level}>
                    <span
                      className="text-xs font-medium px-1.5 py-0.5 rounded-full"
                      style={{
                        backgroundColor: info.bgColor,
                        color: info.color,
                      }}
                    >
                      {info.name}
                    </span>
                  </Select.Option>
                ))}
              </Select>
            </div>

            {/* Date range filter */}
            <div className="hidden">
              <Popover>
                <Popover.Title className="text-kumo-default">Date Range</Popover.Title>
                <Popover.Trigger asChild>
                  <Button variant="outline" className="w-full justify-start text-xs">
                    <CalendarDotsIcon size={16} className="mr-2 shrink-0" />
                    <span className="truncate">{formatDateRange()}</span>
                  </Button>
                </Popover.Trigger>
                <Popover.Content className="p-0 w-auto">
                  <div className="flex">
                    {/* Preset sidebar */}
                    <div className="flex flex-col gap-1 p-2 border-r border-kumo-line min-w-[120px]">
                      <span className="text-xs font-medium text-kumo-subtle px-1 pb-1">Quick select</span>
                      {DATE_PRESETS.map((preset) => (
                        <Button
                          key={preset.label}
                          variant="ghost"
                          size="sm"
                          onClick={() => handlePreset(preset)}
                          className="justify-start text-xs h-7"
                        >
                          {preset.label}
                        </Button>
                      ))}
                    </div>

                    {/* Calendar + time inputs */}
                    <div className="flex flex-col">
                      <DatePicker
                        mode="range"
                        selected={dateRange.from && dateRange.to ? { from: dateRange.from, to: dateRange.to } : undefined}
                        onChange={(range) => {
                          if (range && 'from' in range) {
                            handleDateRangeChange({ from: range.from, to: range.to });
                          }
                        }}
                        numberOfMonths={2}
                      />

                      {/* Time inputs */}
                      <div className="flex items-center gap-3 px-4 py-3 border-t border-kumo-line">
                        <div className="flex items-center gap-2 flex-1">
                          <ClockIcon size={14} className="text-kumo-subtle shrink-0" />
                          <span className="text-xs text-kumo-subtle shrink-0">From</span>
                          <input
                            type="time"
                            value={fromTime}
                            disabled={!dateRange.from}
                            onChange={(e) => handleFromTimeChange(e.target.value)}
                            className="text-xs border border-kumo-line rounded px-2 py-1 bg-kumo-surface text-kumo-default disabled:opacity-40 disabled:cursor-not-allowed w-24"
                          />
                        </div>
                        <div className="flex items-center gap-2 flex-1">
                          <ClockIcon size={14} className="text-kumo-subtle shrink-0" />
                          <span className="text-xs text-kumo-subtle shrink-0">To</span>
                          <input
                            type="time"
                            value={toTime}
                            disabled={!dateRange.to}
                            onChange={(e) => handleToTimeChange(e.target.value)}
                            className="text-xs border border-kumo-line rounded px-2 py-1 bg-kumo-surface text-kumo-default disabled:opacity-40 disabled:cursor-not-allowed w-24"
                          />
                        </div>
                        {(dateRange.from || dateRange.to) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => applyDateRange(undefined)}
                            className="text-xs shrink-0"
                          >
                            <XIcon size={14} className="mr-1" />
                            Clear
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </Popover.Content>
              </Popover>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
