import { useState, useEffect, useCallback, useRef } from 'react';
import type { LogFilter } from '../types';

const DEFAULT_FILTER: LogFilter = {
  page: 1,
  limit: 50,
};

// Serialize filter to URL search params
function serializeFilter(filter: LogFilter): URLSearchParams {
  const params = new URLSearchParams();
  
  if (filter.content) {
    params.set('q', filter.content);
  }
  
  if (filter.client && filter.client.length > 0) {
    params.set('client', filter.client.join(','));
  }
  
  if (filter.hostname && filter.hostname.length > 0) {
    params.set('hostname', filter.hostname.join(','));
  }
  
  if (filter.tag && filter.tag.length > 0) {
    params.set('tag', filter.tag.join(','));
  }
  
  if (filter.severity && filter.severity.length > 0) {
    params.set('severity', filter.severity.join(','));
  }
  
  if (filter.from) {
    params.set('from', filter.from);
  }
  
  if (filter.to) {
    params.set('to', filter.to);
  }
  
  // Only include page if not 1
  if (filter.page && filter.page !== 1) {
    params.set('page', String(filter.page));
  }
  
  // Only include limit if not default
  if (filter.limit && filter.limit !== 50) {
    params.set('limit', String(filter.limit));
  }
  
  return params;
}

// Deserialize URL search params to filter
function deserializeFilter(params: URLSearchParams): LogFilter {
  const filter: LogFilter = { ...DEFAULT_FILTER };
  
  const q = params.get('q');
  if (q) filter.content = q;
  
  const client = params.get('client');
  if (client) filter.client = client.split(',').filter(Boolean);
  
  const hostname = params.get('hostname');
  if (hostname) filter.hostname = hostname.split(',').filter(Boolean);
  
  const tag = params.get('tag');
  if (tag) filter.tag = tag.split(',').filter(Boolean);
  
  const severity = params.get('severity');
  if (severity) {
    filter.severity = severity.split(',')
      .map(s => parseInt(s, 10))
      .filter(n => !isNaN(n));
  }
  
  const from = params.get('from');
  if (from) filter.from = from;
  
  const to = params.get('to');
  if (to) filter.to = to;
  
  const page = params.get('page');
  if (page) {
    const pageNum = parseInt(page, 10);
    if (!isNaN(pageNum) && pageNum > 0) filter.page = pageNum;
  }
  
  const limit = params.get('limit');
  if (limit) {
    const limitNum = parseInt(limit, 10);
    if (!isNaN(limitNum) && [25, 50, 100, 250].includes(limitNum)) {
      filter.limit = limitNum;
    }
  }
  
  return filter;
}

// Check if two filters are equal
function filtersEqual(a: LogFilter, b: LogFilter): boolean {
  return (
    a.content === b.content &&
    arraysEqual(a.client, b.client) &&
    arraysEqual(a.hostname, b.hostname) &&
    arraysEqual(a.tag, b.tag) &&
    arraysEqual(a.severity, b.severity) &&
    a.from === b.from &&
    a.to === b.to &&
    a.page === b.page &&
    a.limit === b.limit
  );
}

function arraysEqual<T>(a?: T[], b?: T[]): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

export function useUrlState(): [LogFilter, (filter: LogFilter, replace?: boolean) => void] {
  // Initialize from URL or defaults
  const [filter, setFilterState] = useState<LogFilter>(() => {
    if (typeof window === 'undefined') return DEFAULT_FILTER;
    
    const params = new URLSearchParams(window.location.search);
    return deserializeFilter(params);
  });
  
  // Track if we're updating from popstate to avoid loops
  const isPopstateUpdate = useRef(false);
  
  // Debounce timer for content search
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>();
  
  // Update URL when filter changes
  const updateUrl = useCallback((newFilter: LogFilter, replace = false) => {
    if (typeof window === 'undefined') return;
    
    const params = serializeFilter(newFilter);
    const search = params.toString();
    const newUrl = search ? `?${search}` : window.location.pathname;
    
    if (replace) {
      window.history.replaceState({ filter: newFilter }, '', newUrl);
    } else {
      window.history.pushState({ filter: newFilter }, '', newUrl);
    }
  }, []);
  
  // Set filter with URL sync
  const setFilter = useCallback((newFilter: LogFilter, replace = false) => {
    setFilterState(prev => {
      // Skip if no change
      if (filtersEqual(prev, newFilter)) return prev;
      
      // Debounce content changes to avoid too many URL updates while typing
      if (prev.content !== newFilter.content) {
        if (debounceTimer.current) {
          clearTimeout(debounceTimer.current);
        }
        debounceTimer.current = setTimeout(() => {
          updateUrl(newFilter, replace);
        }, 300);
      } else {
        // For pagination, use replaceState to avoid polluting history
        const isPaginationOnly = 
          prev.page !== newFilter.page && 
          filtersEqual({ ...prev, page: newFilter.page }, newFilter);
        
        updateUrl(newFilter, replace || isPaginationOnly);
      }
      
      return newFilter;
    });
  }, [updateUrl]);
  
  // Handle browser back/forward
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const handlePopstate = (event: PopStateEvent) => {
      isPopstateUpdate.current = true;
      
      if (event.state?.filter) {
        setFilterState(event.state.filter);
      } else {
        // Parse from URL if no state
        const params = new URLSearchParams(window.location.search);
        setFilterState(deserializeFilter(params));
      }
      
      // Reset flag after state update
      setTimeout(() => {
        isPopstateUpdate.current = false;
      }, 0);
    };
    
    window.addEventListener('popstate', handlePopstate);
    return () => window.removeEventListener('popstate', handlePopstate);
  }, []);
  
  // Sync initial URL state (in case we loaded with params)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Set initial history state
    const params = new URLSearchParams(window.location.search);
    if (params.toString()) {
      window.history.replaceState({ filter }, '', window.location.href);
    }
  }, []); // Only on mount
  
  return [filter, setFilter];
}
