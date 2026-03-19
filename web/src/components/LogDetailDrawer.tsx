import React, { useEffect, useCallback, useMemo, useState } from 'react';
import { Button } from '@cloudflare/kumo';
import { DrawerPreview as Drawer } from '@cloudflare/kumo/primitives/drawer';
import { 
  XIcon, 
  CaretLeftIcon, 
  CaretRightIcon, 
  CopyIcon, 
  FunnelIcon,
  CheckCircleIcon 
} from '@phosphor-icons/react';
import type { LogEntry, LogFilter } from '../types';
import { getSeverityInfo, getFacilityName, formatTimestamp, formatRelativeTime } from '../types';
import { isKeyValueContent, parseKeyValueContent } from './kvParsing';
import type { KeyValuePair } from './kvParsing';

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

// Token types for syntax highlighting
type TokenType = 'uuid' | 'timestamp' | 'url' | 'ip' | 'text';

interface Token {
  type: TokenType;
  value: string;
  start: number;
  end: number;
}

// Pattern definitions for special values (order matters - checked in this order for priority)
const VALUE_PATTERNS: { type: TokenType; pattern: RegExp }[] = [
  // ISO timestamps: 2026-03-19T17:36:23Z, 2026-03-19T17:36:23.123456Z, 2026-03-19T17:36:23+00:00
  { type: 'timestamp', pattern: /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g },
  
  // UUIDs: 550e8400-e29b-41d4-a716-446655440000
  { type: 'uuid', pattern: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi },
  
  // URLs: http://, https://, udp:, tcp:, unix: (must come before IP to catch full URLs)
  { type: 'url', pattern: /(?:https?|udp|tcp|unix):\/\/[^\s"]+/gi },
  
  // IPv4 with optional port: 192.168.1.1, 192.168.1.1:8080
  { type: 'ip', pattern: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(?::\d{1,5})?\b/g },
  
  // IPv6 with optional port: ::1, fe80::1, [::1]:8080, [2001:db8::1]:443
  { type: 'ip', pattern: /\[?(?:(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,7}:|(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}|(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}|(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}|(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:(?::[0-9a-fA-F]{1,4}){1,6}|:(?::[0-9a-fA-F]{1,4}){1,7}|::)\]?(?::\d{1,5})?/g },
];

// Color classes for each token type
const TOKEN_COLORS: Record<TokenType, string> = {
  uuid: 'text-violet-600 dark:text-violet-400',
  timestamp: 'text-cyan-600 dark:text-cyan-400',
  url: 'text-teal-600 dark:text-teal-400',
  ip: 'text-sky-600 dark:text-sky-400',
  text: 'text-green-600 dark:text-green-400', // Default string color
};

// Tokenize a value string, finding all special patterns
function tokenizeValue(value: string): Token[] {
  const tokens: Token[] = [];
  const matches: Token[] = [];
  
  // Find all matches for all patterns
  for (const { type, pattern } of VALUE_PATTERNS) {
    // Reset regex state
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(value)) !== null) {
      matches.push({
        type,
        value: match[0],
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }
  
  // Sort by start position
  matches.sort((a, b) => a.start - b.start);
  
  // Remove overlapping matches (keep earlier/higher priority ones)
  const nonOverlapping: Token[] = [];
  let lastEnd = 0;
  for (const match of matches) {
    if (match.start >= lastEnd) {
      nonOverlapping.push(match);
      lastEnd = match.end;
    }
  }
  
  // Build final token list with text segments between matches
  let pos = 0;
  for (const match of nonOverlapping) {
    // Add text before this match
    if (match.start > pos) {
      tokens.push({
        type: 'text',
        value: value.slice(pos, match.start),
        start: pos,
        end: match.start,
      });
    }
    tokens.push(match);
    pos = match.end;
  }
  
  // Add remaining text after last match
  if (pos < value.length) {
    tokens.push({
      type: 'text',
      value: value.slice(pos),
      start: pos,
      end: value.length,
    });
  }
  
  // If no tokens, return the whole value as text
  if (tokens.length === 0) {
    tokens.push({
      type: 'text',
      value,
      start: 0,
      end: value.length,
    });
  }
  
  return tokens;
}

// Check if value contains any special patterns worth tokenizing
function hasSpecialPatterns(value: string): boolean {
  for (const { pattern } of VALUE_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(value)) {
      return true;
    }
  }
  return false;
}

// Render tokenized value with syntax highlighting and optional search highlighting
function renderTokenizedValue(
  tokens: Token[], 
  searchTerm?: string,
  defaultClass?: string
): React.ReactNode {
  return tokens.map((token, index) => {
    const colorClass = token.type === 'text' && defaultClass 
      ? defaultClass 
      : TOKEN_COLORS[token.type];
    
    // Apply search highlighting within the token
    if (searchTerm) {
      return (
        <span key={index} className={colorClass}>
          <HighlightSearch text={token.value} searchTerm={searchTerm} />
        </span>
      );
    }
    
    return (
      <span key={index} className={colorClass}>
        {token.value}
      </span>
    );
  });
}

// Highlight a single key-value pair with syntax coloring
function highlightKeyValue(pair: KeyValuePair, searchTerm?: string): React.ReactNode {
  const { key, value, rawValue } = pair;
  const isQuoted = rawValue.startsWith('"');
  
  // Check for simple value types first (exact matches)
  if (!isQuoted) {
    // Booleans
    if (value === 'true' || value === 'false') {
      return (
        <>
          <span className="text-blue-600 dark:text-blue-400">{key}</span>
          <span className="text-kumo-subtle">=</span>
          <span className="text-purple-600 dark:text-purple-400">{value}</span>
        </>
      );
    }
    // Null
    if (value === 'null' || value === 'nil') {
      return (
        <>
          <span className="text-blue-600 dark:text-blue-400">{key}</span>
          <span className="text-kumo-subtle">=</span>
          <span className="text-gray-500">{value}</span>
        </>
      );
    }
    // Pure numbers
    if (/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)) {
      return (
        <>
          <span className="text-blue-600 dark:text-blue-400">{key}</span>
          <span className="text-kumo-subtle">=</span>
          <span className="text-orange-600 dark:text-orange-400">{value}</span>
        </>
      );
    }
    // Log levels (exact match)
    if (/^(error|err|fatal|critical|crit)$/i.test(value)) {
      return (
        <>
          <span className="text-blue-600 dark:text-blue-400">{key}</span>
          <span className="text-kumo-subtle">=</span>
          <span className="text-red-600 dark:text-red-400">{value}</span>
        </>
      );
    }
    if (/^(warn|warning)$/i.test(value)) {
      return (
        <>
          <span className="text-blue-600 dark:text-blue-400">{key}</span>
          <span className="text-kumo-subtle">=</span>
          <span className="text-amber-600 dark:text-amber-400">{value}</span>
        </>
      );
    }
    if (/^(info|notice)$/i.test(value)) {
      return (
        <>
          <span className="text-blue-600 dark:text-blue-400">{key}</span>
          <span className="text-kumo-subtle">=</span>
          <span className="text-blue-600 dark:text-blue-400">{value}</span>
        </>
      );
    }
    if (/^(debug|trace)$/i.test(value)) {
      return (
        <>
          <span className="text-blue-600 dark:text-blue-400">{key}</span>
          <span className="text-kumo-subtle">=</span>
          <span className="text-gray-500 dark:text-gray-400">{value}</span>
        </>
      );
    }
  }
  
  // For complex values, check for special patterns (URLs, IPs, timestamps, UUIDs)
  if (hasSpecialPatterns(value)) {
    const tokens = tokenizeValue(value);
    const displayValue = isQuoted ? `"${value}"` : value;
    
    // Re-tokenize with quotes if quoted
    const displayTokens = isQuoted 
      ? [
          { type: 'text' as TokenType, value: '"', start: 0, end: 1 },
          ...tokens.map(t => ({ ...t, start: t.start + 1, end: t.end + 1 })),
          { type: 'text' as TokenType, value: '"', start: displayValue.length - 1, end: displayValue.length },
        ]
      : tokens;
    
    return (
      <>
        <span className="text-blue-600 dark:text-blue-400">{key}</span>
        <span className="text-kumo-subtle">=</span>
        {renderTokenizedValue(displayTokens, searchTerm, 'text-green-600 dark:text-green-400')}
      </>
    );
  }
  
  // Default: simple string value with optional search highlighting
  const displayValue = isQuoted ? `"${value}"` : value;
  const highlightedValue = searchTerm ? (
    <HighlightSearch text={displayValue} searchTerm={searchTerm} />
  ) : (
    displayValue
  );
  
  return (
    <>
      <span className="text-blue-600 dark:text-blue-400">{key}</span>
      <span className="text-kumo-subtle">=</span>
      <span className="text-green-600 dark:text-green-400">{highlightedValue}</span>
    </>
  );
}

// Render key-value pairs interleaved with any free-form text that surrounds
// or falls between the matched pairs, so no part of the original message is
// discarded during formatting.
function KeyValueDisplay({ 
  pairs,
  rawContent,
  searchTerm 
}: { 
  pairs: KeyValuePair[];
  rawContent: string;
  searchTerm?: string;
}): React.ReactElement {
  // Build a flat list of segments: plain text gaps + KV pairs
  type Segment =
    | { kind: 'text'; text: string }
    | { kind: 'kv'; pair: KeyValuePair };

  const segments: Segment[] = [];
  let cursor = 0;

  for (const pair of pairs) {
    if (pair.start > cursor) {
      // Free-form text before this pair
      segments.push({ kind: 'text', text: rawContent.slice(cursor, pair.start) });
    }
    segments.push({ kind: 'kv', pair });
    cursor = pair.end;
  }

  // Trailing free-form text after the last pair
  if (cursor < rawContent.length) {
    segments.push({ kind: 'text', text: rawContent.slice(cursor) });
  }

  // If there is any non-empty free-form text, render everything on a single
  // line so the message reads naturally. Otherwise render each pair on its
  // own line (classic logfmt layout).
  const hasFreText = segments.some(
    (s) => s.kind === 'text' && s.text.trim().length > 0
  );

  if (hasFreText) {
    return (
      <div className="py-0.5">
        {segments.map((seg, i) =>
          seg.kind === 'text' ? (
            <span key={i} className="text-[var(--color-text-primary)]">{seg.text}</span>
          ) : (
            <span key={i}>{highlightKeyValue(seg.pair, searchTerm)}</span>
          )
        )}
      </div>
    );
  }

  return (
    <>
      {pairs.map((pair, index) => (
        <div key={index} className="py-0.5">
          {highlightKeyValue(pair, searchTerm)}
        </div>
      ))}
    </>
  );
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
  
  // Check for key-value format (logfmt style)
  const { isKeyValue, keyValuePairs } = useMemo(() => {
    if (!entry || isJson || isStack) {
      return { isKeyValue: false, keyValuePairs: [] };
    }
    if (isKeyValueContent(entry.content)) {
      return { 
        isKeyValue: true, 
        keyValuePairs: parseKeyValueContent(entry.content) 
      };
    }
    return { isKeyValue: false, keyValuePairs: [] };
  }, [entry, isJson, isStack]);
  
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
                <CaretLeftIcon size={16} />
              </Button>
              <Button
                variant="ghost"
                shape="square"
                size="sm"
                onClick={() => onNavigate('next')}
                disabled={!canNavigateNext}
                aria-label="Next entry (j)"
              >
                <CaretRightIcon size={16} />
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
                    <XIcon size={16} />
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
                  value={`${getFacilityName(entry.facility)} (${entry.facility})`}
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
                  {isKeyValue && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                      Key-Value
                    </span>
                  )}
                  {isStack && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-kumo-danger-tint text-kumo-danger">
                      Stack Trace
                    </span>
                  )}
                  <span className="text-xs text-kumo-inactive">
                    {isKeyValue 
                      ? `${keyValuePairs.length} ${keyValuePairs.length === 1 ? 'field' : 'fields'}`
                      : `${lineCount} ${lineCount === 1 ? 'line' : 'lines'}`
                    }
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
                        <CheckCircleIcon size={14} className="text-kumo-success" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <CopyIcon size={14} />
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
                        <CheckCircleIcon size={14} className="text-kumo-success" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <CopyIcon size={14} />
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
                {isJson ? (
                  highlightJson(formatted)
                ) : isKeyValue ? (
                  <KeyValueDisplay pairs={keyValuePairs} rawContent={entry?.content ?? ''} searchTerm={searchTerm} />
                ) : (
                  <HighlightSearch text={formatted} searchTerm={searchTerm} />
                )}
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
                <FunnelIcon size={12} className="mr-1" />
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
                <FunnelIcon size={12} className="mr-1" />
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
                <FunnelIcon size={12} className="mr-1" />
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
          <FunnelIcon size={12} />
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
