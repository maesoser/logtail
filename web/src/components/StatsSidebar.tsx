import { useCallback, useEffect, useState } from 'react';
import { Button } from '@cloudflare/kumo';
import { XIcon, MagnifyingGlassIcon } from '@phosphor-icons/react';
import type { TopStats, LogFilter } from '../types';
import { SEVERITY_LEVELS } from '../types';
import { useIsMobile } from '../hooks/useMediaQuery';

interface StatsSidebarProps {
  topStats: TopStats | null;
  loading: boolean;
  open: boolean;
  onClose: () => void;
  onFilterBy: (filter: Partial<LogFilter>) => void;
}

interface StatItemProps {
  label: string;
  count: number;
  maxCount: number;
  onFilter: () => void;
  color?: string;
}

function StatItem({ label, count, maxCount, onFilter, color }: StatItemProps) {
  const percentage = maxCount > 0 ? (count / maxCount) * 100 : 0;
  
  return (
    <div 
      className="group flex items-center gap-2 py-1.5 px-2 rounded-lg border border-transparent hover:border-dashed hover:border-kumo-line hover:bg-kumo-tint cursor-pointer transition-colors"
      onClick={onFilter}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onFilter();
        }
      }}
    >
      {color && (
        <span 
          className="w-2 h-2 rounded-full flex-shrink-0" 
          style={{ backgroundColor: color }}
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-kumo-default truncate">{label}</span>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-kumo-subtle tabular-nums">
              {count.toLocaleString()}
            </span>
            <MagnifyingGlassIcon 
              size={12} 
              className="text-kumo-subtle opacity-0 group-hover:opacity-100 transition-opacity" 
            />
          </div>
        </div>
        <div className="mt-1 h-1 bg-kumo-line rounded-full overflow-hidden">
          <div 
            className="h-full rounded-full transition-all duration-300"
            style={{ 
              width: `${percentage}%`,
              backgroundColor: color || 'var(--color-kumo-brand)'
            }}
          />
        </div>
      </div>
    </div>
  );
}

interface StatSectionProps {
  title: string;
  children: React.ReactNode;
}

function StatSection({ title, children }: StatSectionProps) {
  return (
    <div className="mb-4">
      <h3 className="text-xs font-medium text-kumo-subtle uppercase tracking-wider mb-2 px-2">
        {title}
      </h3>
      <div className="space-y-0.5">
        {children}
      </div>
    </div>
  );
}

export function StatsSidebar({ topStats, loading, open, onClose, onFilterBy }: StatsSidebarProps) {
  const isMobile = useIsMobile();

  // Track mount state for animation
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (open) {
      // Small delay to trigger CSS transition after mount
      const timer = setTimeout(() => setIsVisible(true), 10);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [open]);

  // Lock body scroll when open on mobile
  useEffect(() => {
    if (isMobile && open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isMobile, open]);

  const handleHostnameFilter = useCallback((hostname: string) => {
    onFilterBy({ hostname: [hostname] });
  }, [onFilterBy]);

  const handleTagFilter = useCallback((tag: string) => {
    onFilterBy({ tag: [tag] });
  }, [onFilterBy]);

  const handleClientFilter = useCallback((client: string) => {
    onFilterBy({ client: [client] });
  }, [onFilterBy]);

  const handleSeverityFilter = useCallback((level: number) => {
    onFilterBy({ severity: [level] });
  }, [onFilterBy]);

  // Calculate max counts for percentage bars
  const maxHostnameCount = topStats?.hostnames?.[0]?.count || 1;
  const maxTagCount = topStats?.tags?.[0]?.count || 1;
  const maxClientCount = topStats?.clients?.[0]?.count || 1;
  const maxSeverityCount = topStats?.severities?.[0]?.count || 1;

  const content = (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-kumo-line shrink-0">
        <h2 className="text-sm font-medium text-kumo-default">Stats</h2>
        <Button
          variant="ghost"
          shape="square"
          size="sm"
          onClick={onClose}
          aria-label="Close stats sidebar"
        >
          <XIcon size={16} />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-2">
        {loading && !topStats ? (
          <div className="flex items-center justify-center h-32">
            <span className="text-sm text-kumo-subtle">Loading...</span>
          </div>
        ) : !topStats ? (
          <div className="flex items-center justify-center h-32">
            <span className="text-sm text-kumo-subtle">No data</span>
          </div>
        ) : (
          <>
            {/* Total count */}
            <div className="px-2 py-2 mb-3 bg-kumo-fill rounded-lg">
              <div className="text-xs text-kumo-subtle">Total Matching</div>
              <div className="text-lg font-medium text-kumo-default">
                {topStats.total.toLocaleString()}
              </div>
            </div>

            {/* Severities */}
            {topStats.severities.length > 0 && (
              <StatSection title="By Severity">
                {topStats.severities.map((item) => {
                  const severityInfo = SEVERITY_LEVELS[item.level];
                  return (
                    <StatItem
                      key={item.level}
                      label={item.name}
                      count={item.count}
                      maxCount={maxSeverityCount}
                      onFilter={() => handleSeverityFilter(item.level)}
                      color={severityInfo?.color}
                    />
                  );
                })}
              </StatSection>
            )}

            {/* Hostnames */}
            {topStats.hostnames.length > 0 && (
              <StatSection title="Top Hostnames">
                {topStats.hostnames.map((item) => (
                  <StatItem
                    key={item.value}
                    label={item.value}
                    count={item.count}
                    maxCount={maxHostnameCount}
                    onFilter={() => handleHostnameFilter(item.value)}
                  />
                ))}
              </StatSection>
            )}

            {/* Tags */}
            {topStats.tags.length > 0 && (
              <StatSection title="Top Tags">
                {topStats.tags.map((item) => (
                  <StatItem
                    key={item.value}
                    label={item.value}
                    count={item.count}
                    maxCount={maxTagCount}
                    onFilter={() => handleTagFilter(item.value)}
                  />
                ))}
              </StatSection>
            )}

            {/* Clients */}
            {topStats.clients.length > 0 && (
              <StatSection title="Top Clients">
                {topStats.clients.map((item) => (
                  <StatItem
                    key={item.value}
                    label={item.value}
                    count={item.count}
                    maxCount={maxClientCount}
                    onFilter={() => handleClientFilter(item.value)}
                  />
                ))}
              </StatSection>
            )}
          </>
        )}
      </div>
    </>
  );

  // ── Mobile: full-screen bottom sheet ────────────────────────────────────
  if (isMobile) {
    return (
      <>
        {/* Backdrop */}
        <div
          className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-200 ${
            isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
          onClick={onClose}
          aria-hidden="true"
        />

        {/* Sheet */}
        <div
          className={`
            fixed inset-x-0 bottom-0 z-50 flex flex-col
            bg-kumo-base border-t border-kumo-line
            rounded-t-xl
            transition-transform duration-200 ease-out
            ${isVisible ? 'translate-y-0' : 'translate-y-full'}
          `}
          style={{ maxHeight: '80dvh' }}
          role="dialog"
          aria-label="Stats"
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1 shrink-0">
            <div className="w-10 h-1 rounded-full bg-kumo-line" />
          </div>
          {content}
        </div>
      </>
    );
  }

  // ── Desktop: inline sidebar panel ───────────────────────────────────────
  return (
    <aside
      className={`
        w-72 border-l border-kumo-line bg-kumo-base flex flex-col h-full
        transition-transform duration-200 ease-out
        ${isVisible ? 'translate-x-0' : 'translate-x-full'}
      `}
    >
      {content}
    </aside>
  );
}
