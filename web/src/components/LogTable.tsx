import { useCallback, useState, useRef, useEffect } from 'react';
import { Table, Pagination, Empty, Loader } from '@cloudflare/kumo';
import { ListDashesIcon, DotsSixVerticalIcon } from '@phosphor-icons/react';
import type { LogEntry, ColumnConfig } from '../types';
import { getSeverityInfo, formatTimestamp } from '../types';
import { HighlightedText } from './HighlightedText';

interface LogTableProps {
  entries: LogEntry[];
  columns: ColumnConfig[];
  loading?: boolean;
  page: number;
  totalPages: number;
  totalCount: number;
  limit: number;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
  onEntrySelect?: (entry: LogEntry) => void;
  searchTerm?: string;
  onColumnsChange?: (columns: ColumnConfig[]) => void;
  isMobile?: boolean;
}

// Columns to show on mobile (essential only)
const MOBILE_COLUMNS: Array<keyof LogEntry> = ['severity', 'timestamp', 'content'];

export function LogTable({
  entries,
  columns,
  loading,
  page,
  totalCount,
  limit,
  onPageChange,
  onLimitChange,
  onEntrySelect,
  searchTerm,
  onColumnsChange,
  isMobile = false,
}: LogTableProps) {
  // On mobile, only show essential columns
  const visibleColumns = isMobile 
    ? columns.filter(c => MOBILE_COLUMNS.includes(c.key))
    : columns.filter(c => c.visible);

  const handleRowClick = useCallback((entry: LogEntry) => {
    onEntrySelect?.(entry);
  }, [onEntrySelect]);

  // Column resize state
  const [resizing, setResizing] = useState<{
    columnKey: string;
    startX: number;
    startWidth: number;
  } | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  // Column drag state
  const [dragging, setDragging] = useState<{
    columnKey: string;
    overColumnKey: string | null;
  } | null>(null);

  // Handle column resize
  const handleResizeStart = useCallback((
    e: React.MouseEvent,
    columnKey: string,
    currentWidth: number
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setResizing({
      columnKey,
      startX: e.clientX,
      startWidth: currentWidth,
    });
  }, []);

  useEffect(() => {
    if (!resizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - resizing.startX;
      const newWidth = Math.max(60, Math.min(500, resizing.startWidth + delta));
      
      // Update column width
      const newColumns = columns.map(col => 
        col.key === resizing.columnKey 
          ? { ...col, width: `${newWidth}px` }
          : col
      );
      onColumnsChange?.(newColumns);
    };

    const handleMouseUp = () => {
      setResizing(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizing, columns, onColumnsChange]);

  // Handle column drag and drop
  const handleDragStart = useCallback((e: React.DragEvent, columnKey: string) => {
    // Don't allow dragging the content column
    if (columnKey === 'content') {
      e.preventDefault();
      return;
    }
    
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', columnKey);
    setDragging({ columnKey, overColumnKey: null });
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, columnKey: string) => {
    e.preventDefault();
    if (dragging && dragging.columnKey !== columnKey && columnKey !== 'content') {
      setDragging(prev => prev ? { ...prev, overColumnKey: columnKey } : null);
    }
  }, [dragging]);

  const handleDragEnd = useCallback(() => {
    setDragging(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetColumnKey: string) => {
    e.preventDefault();
    
    if (!dragging || targetColumnKey === 'content') {
      setDragging(null);
      return;
    }

    const sourceKey = dragging.columnKey;
    if (sourceKey === targetColumnKey) {
      setDragging(null);
      return;
    }

    // Reorder columns
    const sourceIndex = columns.findIndex(c => c.key === sourceKey);
    const targetIndex = columns.findIndex(c => c.key === targetColumnKey);
    
    if (sourceIndex === -1 || targetIndex === -1) {
      setDragging(null);
      return;
    }

    const newColumns = [...columns];
    const [removed] = newColumns.splice(sourceIndex, 1);
    newColumns.splice(targetIndex, 0, removed);
    
    onColumnsChange?.(newColumns);
    setDragging(null);
  }, [dragging, columns, onColumnsChange]);

  // Get column width as number
  const getColumnWidth = (col: ColumnConfig): number => {
    if (!col.width) return 100;
    const width = parseInt(col.width, 10);
    return isNaN(width) ? 100 : width;
  };

  // Get severity-specific badge styles
  const getSeverityBadgeStyle = (severity: number): React.CSSProperties => {
    const info = getSeverityInfo(severity);
    return {
      backgroundColor: info.bgColor,
      color: info.color,
      borderColor: info.bgColor,
    };
  };

  const renderCellContent = (entry: LogEntry, column: ColumnConfig) => {
    const value = entry[column.key];

    switch (column.key) {
      case 'timestamp':
        return (
          <span className="text-xs whitespace-nowrap text-kumo-strong">
            {formatTimestamp(value as string)}
          </span>
        );

      case 'severity': {
        const severity = getSeverityInfo(value as number);
        const badgeStyle = getSeverityBadgeStyle(value as number);
        return (
          <span 
            className="inline-flex items-center px-1.5 py-0.5 rounded text-xs uppercase font-medium"
            style={badgeStyle}
          >
            {severity.name}
          </span>
        );
      }

      case 'priority':
        return (
          <span className="text-xs text-kumo-subtle">
            {value}
          </span>
        );

      case 'content':
        return (
          <span className="font-mono text-xs truncate block text-kumo-default">
            {searchTerm ? (
              <HighlightedText text={String(value)} highlight={searchTerm} />
            ) : (
              value
            )}
          </span>
        );

      default:
        return (
          <span className="text-xs truncate text-kumo-strong" title={String(value)}>
            {value || '-'}
          </span>
        );
    }
  };

  if (loading && entries.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader size="lg" />
      </div>
    );
  }

  if (!loading && entries.length === 0) {
    return (
      <Empty
        icon={<ListDashesIcon size={48} className="text-kumo-subtle" />}
        title="No logs found"
        description="Try adjusting your filters or wait for new log entries."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div 
        ref={tableRef}
        className={`bg-kumo-elevated border border-kumo-line rounded overflow-hidden ${resizing ? 'select-none' : ''}`}
      >
        <div className="overflow-x-auto">
          <Table layout="fixed">
            <colgroup>
              {visibleColumns.map(col => (
                <col
                  key={col.key}
                  style={{ width: col.width || 'auto' }}
                />
              ))}
            </colgroup>
            <Table.Header>
              <Table.Row>
                {visibleColumns.map(col => {
                  const isDragging = dragging?.columnKey === col.key;
                  const isDragOver = dragging?.overColumnKey === col.key;
                  const isContentCol = col.key === 'content';
                  
                  return (
                    <Table.Head
                      key={col.key}
                      className={`
                        text-xs font-semibold text-kumo-subtle uppercase tracking-wider 
                        py-1 px-1.5 bg-kumo-tint relative group
                        ${!isContentCol ? 'cursor-grab' : ''}
                        ${isDragging ? 'opacity-50' : ''}
                        ${isDragOver ? 'bg-kumo-info-tint' : ''}
                      `}
                      draggable={!isContentCol}
                      onDragStart={(e) => handleDragStart(e, col.key)}
                      onDragOver={(e) => handleDragOver(e, col.key)}
                      onDragEnd={handleDragEnd}
                      onDrop={(e) => handleDrop(e, col.key)}
                    >
                      <div className="flex items-center gap-1">
                        {!isContentCol && (
                          <DotsSixVerticalIcon
                            size={12} 
                            className="text-kumo-subtle opacity-0 group-hover:opacity-100 transition-opacity cursor-grab" 
                          />
                        )}
                        <span className="flex-1">{col.label}</span>
                      </div>
                      
                      {/* Resize handle */}
                      {!isContentCol && (
                        <div
                          className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-500 transition-colors"
                          onMouseDown={(e) => handleResizeStart(e, col.key, getColumnWidth(col))}
                        />
                      )}
                    </Table.Head>
                  );
                })}
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {entries.map(entry => {
                return (
                  <Table.Row
                    key={entry.id}
                    className="hover:bg-kumo-tint transition-colors cursor-pointer"
                    onClick={() => handleRowClick(entry)}
                  >
                    {visibleColumns.map(col => (
                      <Table.Cell
                        key={`${entry.id}-${col.key}`}
                        className={`py-0.5 px-1.5 ${col.key === 'content' ? 'max-w-0' : ''}`}
                      >
                        {renderCellContent(entry, col)}
                      </Table.Cell>
                    ))}
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <Pagination
          page={page}
          setPage={onPageChange}
          perPage={limit}
          totalCount={totalCount}
        >
          <Pagination.Info />
          <div className="flex items-center gap-2">
            <Pagination.PageSize
              value={limit}
              onChange={(size) => {
                onLimitChange(size);
                onPageChange(1);
              }}
              options={[25, 50, 100, 250]}
            />
            <Pagination.Controls />
          </div>
        </Pagination>
      </div>
    </div>
  );
}

// Compact row component for real-time streaming view
export function LogRow({ entry, columns }: { entry: LogEntry; columns: ColumnConfig[] }) {
  const visibleColumns = columns.filter(c => c.visible);
  const severity = getSeverityInfo(entry.severity);

  // Get severity-specific badge styles
  const badgeStyle: React.CSSProperties = {
    backgroundColor: severity.bgColor,
    color: severity.color,
    borderColor: severity.bgColor,
  };

  return (
    <div className="flex items-center gap-2 py-1 px-2 border-b border-kumo-line hover:bg-kumo-tint animate-fade-in">
      <span
        className="inline-flex items-center px-1.5 py-0.5 rounded text-xs uppercase font-medium shrink-0"
        style={badgeStyle}
      >
        {severity.name}
      </span>
      <span className="text-xs text-kumo-subtle shrink-0 w-36">
        {formatTimestamp(entry.timestamp)}
      </span>
      {visibleColumns.some(c => c.key === 'hostname') && (
        <span className="text-xs text-kumo-strong shrink-0 w-32 truncate">
          {entry.hostname || '-'}
        </span>
      )}
      {visibleColumns.some(c => c.key === 'tag') && (
        <span className="text-xs text-kumo-subtle shrink-0 w-24 truncate">
          {entry.tag || '-'}
        </span>
      )}
      <span className="font-mono text-xs flex-1 truncate text-kumo-default">
        {entry.content}
      </span>
    </div>
  );
}
