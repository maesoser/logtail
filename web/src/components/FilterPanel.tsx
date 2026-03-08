import { useState, useEffect, useCallback } from 'react';
import { Input, Button, DatePicker, Popover, Badge, Text, Select, Combobox } from '@cloudflare/kumo';
import { MagnifyingGlass, X, CalendarDots, Funnel, Database, Clock, WifiHigh, WifiSlash } from '@phosphor-icons/react';
import type { LogFilter, Stats } from '../types';
import { SEVERITY_LEVELS, formatRelativeTime } from '../types';

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

  const handleDateRangeChange = useCallback((range: { from?: Date; to?: Date } | undefined) => {
    if (!range) {
      setDateRange({});
      const newFilter = { ...localFilter, from: undefined, to: undefined, page: 1 };
      setLocalFilter(newFilter);
      onFilterChange(newFilter);
      return;
    }
    
    setDateRange(range);
    const newFilter = {
      ...localFilter,
      from: range.from?.toISOString(),
      to: range.to?.toISOString(),
      page: 1,
    };
    setLocalFilter(newFilter);
    onFilterChange(newFilter);
  }, [localFilter, onFilterChange]);

  const clearFilters = useCallback(() => {
    const clearedFilter: LogFilter = { page: 1, limit: filter.limit };
    setLocalFilter(clearedFilter);
    setDebouncedContent('');
    setDateRange({});
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
      return `${dateRange.from.toLocaleDateString()} - ${dateRange.to.toLocaleDateString()}`;
    }
    if (dateRange.from) {
      return `From ${dateRange.from.toLocaleDateString()}`;
    }
    if (dateRange.to) {
      return `Until ${dateRange.to.toLocaleDateString()}`;
    }
    return 'Select dates';
  };

  return (
    <div className="bg-kumo-elevated border border-kumo-line rounded p-3">
      {/* Main search bar with stats */}
      <div className={`flex gap-2 md:gap-3 ${isMobile ? 'flex-col' : 'items-center'}`}>
        <div className={`flex gap-2 ${isMobile ? 'w-full' : 'flex-1'}`}>
          <div className="flex-1 relative">
            <MagnifyingGlass 
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
            <Funnel size={16} />
            {!isMobile && 'Filters'}
            {hasActiveFilters && (
              <span className="bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
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
              <X size={16} />
              {!isMobile && 'Clear'}
            </Button>
          )}
        </div>

        {/* Stats section - right aligned on desktop, full width on mobile */}
        <div className={`flex items-center gap-3 md:gap-4 text-xs ${isMobile ? 'justify-between' : 'ml-auto'}`}>
          <div className="flex items-center gap-1.5">
            <Database size={14} className="text-kumo-subtle" />
            <Text variant="secondary">
              {stats?.totalEntries?.toLocaleString() ?? 0}{!isMobile && ` / ${stats?.bufferSizeBytes?.toLocaleString() ?? 0}`}
            </Text>
          </div>
          
          {stats?.oldestTimestamp && !isMobile && (
            <div className="flex items-center gap-1.5">
              <Clock size={14} className="text-kumo-subtle" />
              <Text variant="secondary">
                {formatRelativeTime(stats.oldestTimestamp)}
              </Text>
            </div>
          )}
          
          <div className="flex items-center gap-1.5">
            {connected ? (
              <WifiHigh size={14} className="text-kumo-success" />
            ) : (
              <WifiSlash size={14} className="text-kumo-subtle" />
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
                            className="text-xs font-medium px-1 py-0.5 rounded"
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
                      className="text-xs font-medium px-1.5 py-0.5 rounded"
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
            <div>
              <Popover>
                <Popover.Title className="text-kumo-default">Date Range</Popover.Title>
                <Popover.Trigger asChild>
                  <Button variant="outline" className="w-full justify-start">
                    <CalendarDots size={16} className="mr-2" />
                    {formatDateRange()}
                  </Button>
                </Popover.Trigger>
                <Popover.Content className="p-1">
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
                  {(dateRange.from || dateRange.to) && (
                    <div className="p-2 border-t border-kumo-line">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDateRangeChange(undefined)}
                        className="w-full"
                      >
                        Clear dates
                      </Button>
                    </div>
                  )}
                </Popover.Content>
              </Popover>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
