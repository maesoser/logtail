import { useState, useCallback, useMemo } from 'react';
import { Button } from '@cloudflare/kumo';
import { 
  Lightning, 
  ArrowClockwise,
  Sun,
  Moon
} from '@phosphor-icons/react';
import { useLogs, useWebSocket } from './hooks/useLogs';
import { useStats, useUniqueValues } from './hooks/useStats';
import { useDarkMode } from './hooks/useDarkMode';
import { usePersistedColumns } from './hooks/usePersistedColumns';
import { useIsMobile } from './hooks/useMediaQuery';
import { useUrlState } from './hooks/useUrlState';
import { ActivityHistogram, ActivityHistogramCompact } from './components/ActivityHistogram';
import { FilterPanel } from './components/FilterPanel';
import { LogTable } from './components/LogTable';
import { LogDetailDrawer } from './components/LogDetailDrawer';
import { Settings } from './components/Settings';
import type { LogFilter, LogEntry } from './types';

function App() {
  // Dark mode
  const { isDark, toggle: toggleDarkMode } = useDarkMode();
  
  // Responsive
  const isMobile = useIsMobile();
  
  // Filter state (synced with URL)
  const [filter, setFilter] = useUrlState();
  
  // Column configuration (persisted to localStorage)
  const { columns, setColumns, resetColumns } = usePersistedColumns();
  
  // Real-time streaming state
  const [realtimeEntries, setRealtimeEntries] = useState<LogEntry[]>([]);
  
  // Drawer state
  const [selectedEntry, setSelectedEntry] = useState<LogEntry | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  
  // Fetch data
  const { data: logsData, loading: logsLoading, refetch: refetchLogs } = useLogs(filter);
  const { stats, refetch: refetchStats } = useStats(10000, { severity: filter.severity });
  
  // Fetch unique values for filter dropdowns
  const { values: uniqueClients } = useUniqueValues('client');
  const { values: uniqueHostnames } = useUniqueValues('hostname');
  const { values: uniqueTags } = useUniqueValues('tag');
  
  // Handle new log entries from WebSocket
  const handleNewLogEntry = useCallback((entry: LogEntry) => {
    setRealtimeEntries(prev => {
      const newEntries = [entry, ...prev].slice(0, 100); // Keep last 100 real-time entries
      return newEntries;
    });
  }, []);
  
  // WebSocket connection
  const { connected } = useWebSocket(handleNewLogEntry);
  
  // Combine real-time entries with fetched entries when on first page with no filters
  const displayEntries = useMemo(() => {
    const hasFilters = !!(filter.client || filter.hostname || filter.tag || filter.content || filter.severity?.length || filter.from || filter.to);
    
    if (filter.page === 1 && !hasFilters && realtimeEntries.length > 0) {
      // Merge real-time entries with fetched entries, avoiding duplicates
      const fetchedIds = new Set(logsData?.entries.map(e => e.id) || []);
      const uniqueRealtime = realtimeEntries.filter(e => !fetchedIds.has(e.id));
      return [...uniqueRealtime, ...(logsData?.entries || [])];
    }
    
    return logsData?.entries || [];
  }, [filter, realtimeEntries, logsData]);
  
  // Handle filter change
  const handleFilterChange = useCallback((newFilter: LogFilter) => {
    setFilter(newFilter);
    setRealtimeEntries([]); // Clear real-time entries when filter changes
  }, [setFilter]);
  
  // Handle page change (use replace to avoid polluting history)
  const handlePageChange = useCallback((page: number) => {
    setFilter({ ...filter, page }, true);
  }, [filter, setFilter]);
  
  // Handle limit change
  const handleLimitChange = useCallback((limit: number) => {
    setFilter({ ...filter, limit, page: 1 });
  }, [filter, setFilter]);
  
  // Refresh all data
  const handleRefresh = useCallback(() => {
    refetchLogs();
    refetchStats();
  }, [refetchLogs, refetchStats]);
  
  // Handle entry selection for drawer
  const handleEntrySelect = useCallback((entry: LogEntry) => {
    setSelectedEntry(entry);
    setDrawerOpen(true);
  }, []);
  
  // Handle drawer navigation
  const handleDrawerNavigate = useCallback((direction: 'prev' | 'next') => {
    if (!selectedEntry) return;
    
    const currentIndex = displayEntries.findIndex(e => e.id === selectedEntry.id);
    if (currentIndex === -1) return;
    
    const newIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex >= 0 && newIndex < displayEntries.length) {
      setSelectedEntry(displayEntries[newIndex]);
    }
  }, [selectedEntry, displayEntries]);
  
  // Handle quick filter from drawer
  const handleQuickFilter = useCallback((newFilter: Partial<LogFilter>) => {
    setFilter({ ...filter, ...newFilter, page: 1 });
    setRealtimeEntries([]);
  }, [filter, setFilter]);
  
  // Calculate navigation state for drawer
  const selectedEntryIndex = selectedEntry 
    ? displayEntries.findIndex(e => e.id === selectedEntry.id) 
    : -1;
  const canNavigatePrev = selectedEntryIndex > 0;
  const canNavigateNext = selectedEntryIndex >= 0 && selectedEntryIndex < displayEntries.length - 1;

  return (
    <div className="min-h-screen color-kumo-base
 text-kumo-default">
      {/* Header */}
      <header className="bg-kumo-base border-b border-kumo-line sticky top-0 z-10">
        <div className="mx-auto px-4 md:px-6 py-3 md:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 md:gap-3">
              <Lightning size={isMobile ? 24 : 28} weight="fill" className="text-kumo-brand" />
              <h1 className="text-lg md:text-xl font-semibold text-kumo-default">
                logtail
              </h1>
            </div>
            
            <div className="flex items-center gap-2 md:gap-4">
              {/* Refresh button */}
              <Button 
                variant="outline" 
                onClick={handleRefresh}
                shape={isMobile ? 'square' : undefined}
                aria-label="Refresh"
                className="flex items-center gap-2"
              >
                <ArrowClockwise size={16} />
                {!isMobile && 'Refresh'}
              </Button>
              
              {/* Settings - hide on mobile */}
              {!isMobile && (
                <Settings
                  columns={columns}
                  onColumnsChange={setColumns}
                  onResetColumns={resetColumns}
                />
              )}
              
              {/* Dark mode toggle */}
              <Button
                variant="outline"
                shape="square"
                onClick={toggleDarkMode}
                aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {isDark ? <Sun size={16} /> : <Moon size={16} />}
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="px-4 py-4 space-y-4">
        {/* Activity Histogram */}
        {stats && stats.histogram.length > 0 && (
          isMobile ? (
            <div className="bg-kumo-base border border-kumo-line rounded p-3">
              <h3 className="text-sm font-semibold mb-2 text-kumo-default">Recent Activity</h3>
              <ActivityHistogramCompact data={stats.histogram} />
            </div>
          ) : (
            <ActivityHistogram data={stats.histogram} />
          )
        )}

        {/* Filter Panel */}
        <FilterPanel
          filter={filter}
          onFilterChange={handleFilterChange}
          uniqueClients={uniqueClients}
          uniqueHostnames={uniqueHostnames}
          uniqueTags={uniqueTags}
          stats={stats}
          connected={connected}
          realtimeCount={realtimeEntries.length}
          isMobile={isMobile}
        />

        {/* Log Table */}
        <LogTable
          entries={displayEntries}
          columns={columns}
          loading={logsLoading}
          page={filter.page || 1}
          totalPages={logsData?.totalPages || 1}
          totalCount={logsData?.totalCount || 0}
          limit={filter.limit || 50}
          onPageChange={handlePageChange}
          onLimitChange={handleLimitChange}
          onEntrySelect={handleEntrySelect}
          onColumnsChange={setColumns}
          searchTerm={filter.content}
          isMobile={isMobile}
        />
      </main>
      
      {/* Log Detail Drawer */}
      <LogDetailDrawer
        entry={selectedEntry}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onNavigate={handleDrawerNavigate}
        onFilterBy={handleQuickFilter}
        canNavigatePrev={canNavigatePrev}
        canNavigateNext={canNavigateNext}
        searchTerm={filter.content}
      />
    </div>
  );
}

export default App;
