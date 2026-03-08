import React, { useEffect, useCallback, useMemo, useState } from 'react';
import { Button } from '@cloudflare/kumo';
import { DrawerPreview as Drawer } from '@cloudflare/kumo/primitives/drawer';
import { 
  X, 
  CaretLeft, 
  CaretRight, 
  Copy, 
  Funnel,
  CheckCircle 
} from '@phosphor-icons/react';
import type { LogEntry, LogFilter } from '../types';
import { getSeverityInfo, formatTimestamp, formatRelativeTime } from '../types';

interface LogDetailDrawerProps {
  entry: LogEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (direction: 'prev' | 'next') => void;
  onFilterBy: (filter: Partial<LogFilter>) => void;
  canNavigatePrev: boolean;
  canNavigateNext: boolean;
  searchTerm?: string;
}

// Check if content looks like JSON
function isJsonContent(content: string): boolean {
  const trimmed = content.trim();
  return (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
         (trimmed.startsWith('[') && trimmed.endsWith(']'));
}

// Check if content looks like a stack trace
function isStackTrace(content: string): boolean {
  return /^\s*(at\s+|Error:|Exception:|Traceback|Caused by:)/m.test(content);
}

// Try to parse and format JSON
function tryFormatJson(content: string): { formatted: string; isJson: boolean } {
  if (!isJsonContent(content)) {
    return { formatted: content, isJson: false };
  }
  
  try {
    const parsed = JSON.parse(content);
    return { formatted: JSON.stringify(parsed, null, 2), isJson: true };
  } catch {
    return { formatted: content, isJson: false };
  }
}

// Syntax highlight JSON
function highlightJson(json: string): React.ReactNode {
  // Regex to match JSON tokens
  const tokenRegex = /("(?:\\.|[^"\\])*")\s*:|("(?:\\.|[^"\\])*")|(\b(?:true|false)\b)|(\bnull\b)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
  
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let key = 0;
  
  while ((match = tokenRegex.exec(json)) !== null) {
    // Add text before match
    if (match.index > lastIndex) {
      parts.push(json.slice(lastIndex, match.index));
    }
    
    const [fullMatch, keyMatch, stringMatch, boolMatch, nullMatch, numberMatch] = match;
    
    if (keyMatch) {
      // JSON key
      parts.push(
        <span key={key++} className="text-blue-600 dark:text-blue-400">{keyMatch}</span>
      );
      parts.push(':');
    } else if (stringMatch) {
      // JSON string value
      parts.push(
        <span key={key++} className="text-green-600 dark:text-green-400">{stringMatch}</span>
      );
    } else if (boolMatch) {
      // Boolean
      parts.push(
        <span key={key++} className="text-purple-600 dark:text-purple-400">{boolMatch}</span>
      );
    } else if (nullMatch) {
      // Null
      parts.push(
        <span key={key++} className="text-gray-500 dark:text-gray-500">{nullMatch}</span>
      );
    } else if (numberMatch) {
      // Number
      parts.push(
        <span key={key++} className="text-orange-600 dark:text-orange-400">{numberMatch}</span>
      );
    } else {
      parts.push(fullMatch);
    }
    
    lastIndex = match.index + fullMatch.length;
  }
  
  // Add remaining text
  if (lastIndex < json.length) {
    parts.push(json.slice(lastIndex));
  }
  
  return parts;
}

// Copy to clipboard with feedback
function useCopyToClipboard() {
  const [copied, setCopied] = useState(false);
  
  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, []);
  
  return { copied, copy };
}

export function LogDetailDrawer({
  entry,
  open,
  onOpenChange,
  onNavigate,
  onFilterBy,
  canNavigatePrev,
  canNavigateNext,
  searchTerm,
}: LogDetailDrawerProps) {
  const { copied: copiedContent, copy: copyContent } = useCopyToClipboard();
  const { copied: copiedJson, copy: copyJson } = useCopyToClipboard();
  
  // Process content
  const { formatted, isJson } = useMemo(() => {
    if (!entry) return { formatted: '', isJson: false };
    return tryFormatJson(entry.content);
  }, [entry]);
  
  const isStack = useMemo(() => {
    if (!entry || isJson) return false;
    return isStackTrace(entry.content);
  }, [entry, isJson]);
  
  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      switch (e.key) {
        case 'ArrowUp':
        case 'k':
          if (canNavigatePrev) {
            e.preventDefault();
            onNavigate('prev');
          }
          break;
        case 'ArrowDown':
        case 'j':
          if (canNavigateNext) {
            e.preventDefault();
            onNavigate('next');
          }
          break;
        case 'c':
          if (entry && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            copyContent(entry.content);
          }
          break;
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, entry, canNavigatePrev, canNavigateNext, onNavigate, copyContent]);
  
  if (!entry) return null;
  
  const severity = getSeverityInfo(entry.severity);
  const lineCount = formatted.split('\n').length;
  
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} modal>
      <Drawer.Portal>
        <Drawer.Backdrop 
          className="fixed inset-0 z-50 bg-black/50 transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" 
        />
        <Drawer.Popup
          className="fixed top-0 right-0 z-50 h-full w-full max-w-xl bg-kumo-base shadow-xl flex flex-col transition-transform duration-200 data-[ending-style]:translate-x-full data-[starting-style]:translate-x-full"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-kumo-line">
            <div className="flex items-center gap-3">
              <span
                className="inline-flex items-center px-2 py-1 rounded text-sm font-semibold uppercase"
                style={{
                  backgroundColor: severity.bgColor,
                  color: severity.color,
                }}
              >
                {severity.name}
              </span>
              <div className="text-sm text-kumo-subtle">
                <span className="font-medium text-kumo-default">{formatTimestamp(entry.timestamp)}</span>
                <span className="ml-2 text-kumo-inactive">
                  ({formatRelativeTime(entry.timestamp)})
                </span>
              </div>
            </div>
            
            <div className="flex items-center gap-1">
              {/* Navigation */}
              <Button
                variant="ghost"
                shape="square"
                size="sm"
                onClick={() => onNavigate('prev')}
                disabled={!canNavigatePrev}
                aria-label="Previous entry (k)"
              >
                <CaretLeft size={16} />
              </Button>
              <Button
                variant="ghost"
                shape="square"
                size="sm"
                onClick={() => onNavigate('next')}
                disabled={!canNavigateNext}
                aria-label="Next entry (j)"
              >
                <CaretRight size={16} />
              </Button>
              
              <div className="w-px h-4 bg-kumo-line mx-1" />
              
              <Drawer.Close
                render={(props: React.HTMLAttributes<HTMLButtonElement>) => (
                  <Button
                    {...props}
                    variant="ghost"
                    shape="square"
                    size="sm"
                    aria-label="Close drawer"
                  >
                    <X size={16} />
                  </Button>
                )}
              />
            </div>
          </div>
          
          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto">
            {/* Metadata grid */}
            <div className="px-4 py-3 border-b border-kumo-line">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <MetadataItem
                  label="Hostname"
                  value={entry.hostname}
                  onFilter={() => {
                    onFilterBy({ hostname: [entry.hostname] });
                    onOpenChange(false);
                  }}
                />
                <MetadataItem
                  label="Client"
                  value={entry.client}
                  onFilter={() => {
                    onFilterBy({ client: [entry.client] });
                    onOpenChange(false);
                  }}
                />
                <MetadataItem
                  label="Tag"
                  value={entry.tag}
                  onFilter={() => {
                    onFilterBy({ tag: [entry.tag] });
                    onOpenChange(false);
                  }}
                />
                <MetadataItem
                  label="Severity"
                  value={severity.name}
                  onFilter={() => {
                    onFilterBy({ severity: [entry.severity] });
                    onOpenChange(false);
                  }}
                />
                <MetadataItem
                  label="Facility"
                  value={String(entry.facility)}
                />
                <MetadataItem
                  label="Priority"
                  value={String(entry.priority)}
                />
              </div>
            </div>
            
            {/* Content section */}
            <div className="px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-kumo-strong">
                    Content
                  </span>
                  {isJson && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-kumo-info-tint text-kumo-link">
                      JSON
                    </span>
                  )}
                  {isStack && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-kumo-danger-tint text-kumo-danger">
                      Stack Trace
                    </span>
                  )}
                  <span className="text-xs text-kumo-inactive">
                    {lineCount} {lineCount === 1 ? 'line' : 'lines'}
                  </span>
                </div>
                
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyContent(entry.content)}
                    className="flex items-center gap-1 text-xs"
                  >
                    {copiedContent ? (
                      <>
                        <CheckCircle size={14} className="text-kumo-success" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy size={14} />
                        Copy
                      </>
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyJson(JSON.stringify(entry, null, 2))}
                    className="flex items-center gap-1 text-xs"
                  >
                    {copiedJson ? (
                      <>
                        <CheckCircle size={14} className="text-kumo-success" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy size={14} />
                        Copy as JSON
                      </>
                    )}
                  </Button>
                </div>
              </div>
              
              {/* Content display */}
              <pre className={`
                text-sm font-mono whitespace-pre-wrap break-words
                bg-kumo-recessed rounded-lg p-3
                border border-kumo-line
                max-h-96 overflow-y-auto
                ${isStack ? 'text-kumo-danger' : 'text-kumo-default'}
              `}>
                {isJson ? highlightJson(formatted) : <HighlightSearch text={formatted} searchTerm={searchTerm} />}
              </pre>
            </div>
          </div>
          
          {/* Footer with quick actions */}
          <div className="px-4 py-3 border-t border-kumo-line bg-kumo-tint">
            <div className="flex items-center gap-2 text-xs text-kumo-subtle">
              <span>Quick filters:</span>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => {
                  onFilterBy({ hostname: [entry.hostname] });
                  onOpenChange(false);
                }}
              >
                <Funnel size={12} className="mr-1" />
                This host
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => {
                  onFilterBy({ tag: [entry.tag] });
                  onOpenChange(false);
                }}
              >
                <Funnel size={12} className="mr-1" />
                This tag
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => {
                  onFilterBy({ severity: [entry.severity] });
                  onOpenChange(false);
                }}
              >
                <Funnel size={12} className="mr-1" />
                This severity
              </Button>
            </div>
            <div className="mt-2 text-xs text-kumo-inactive">
              Keyboard: <kbd className="px-1 py-0.5 bg-kumo-fill rounded">j</kbd>/<kbd className="px-1 py-0.5 bg-kumo-fill rounded">k</kbd> navigate, <kbd className="px-1 py-0.5 bg-kumo-fill rounded">c</kbd> copy, <kbd className="px-1 py-0.5 bg-kumo-fill rounded">Esc</kbd> close
            </div>
          </div>
        </Drawer.Popup>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

// Metadata item component
function MetadataItem({ 
  label, 
  value, 
  onFilter 
}: { 
  label: string; 
  value: string; 
  onFilter?: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <span className="text-kumo-subtle">{label}:</span>
        <span className="ml-2 font-medium text-kumo-default">
          {value || '-'}
        </span>
      </div>
      {onFilter && value && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onFilter}
          className="text-xs opacity-0 group-hover:opacity-100 hover:opacity-100"
          aria-label={`Filter by ${label}`}
        >
          <Funnel size={12} />
        </Button>
      )}
    </div>
  );
}

// Simple search highlight component (will be replaced with full HighlightedText later)
function HighlightSearch({ text, searchTerm }: { text: string; searchTerm?: string }) {
  if (!searchTerm) return <>{text}</>;
  
  const parts = text.split(new RegExp(`(${escapeRegex(searchTerm)})`, 'gi'));
  
  return (
    <>
      {parts.map((part, i) => 
        part.toLowerCase() === searchTerm.toLowerCase() ? (
          <mark key={i} className="bg-yellow-200 dark:bg-yellow-800 text-inherit rounded px-0.5">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}

// Escape special regex characters
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
