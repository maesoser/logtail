import { useState, useEffect, useCallback } from 'react';
import type { TimeRange } from '../types';
import { isValidTimeRange } from '../types';

const DEFAULT_TIME_RANGE: TimeRange = '24h';
const URL_PARAM_KEY = 'range';

/**
 * Hook for managing time range state with URL persistence.
 * The time range is stored in the URL as ?range=8h|24h|5d
 */
export function useTimeRangeUrlState(): [TimeRange, (range: TimeRange) => void] {
  // Initialize from URL or defaults
  const [timeRange, setTimeRangeState] = useState<TimeRange>(() => {
    if (typeof window === 'undefined') return DEFAULT_TIME_RANGE;
    
    const params = new URLSearchParams(window.location.search);
    const range = params.get(URL_PARAM_KEY);
    
    if (range && isValidTimeRange(range)) {
      return range;
    }
    
    return DEFAULT_TIME_RANGE;
  });
  
  // Update URL when time range changes
  const setTimeRange = useCallback((newRange: TimeRange) => {
    setTimeRangeState(prev => {
      if (prev === newRange) return prev;
      
      // Update URL
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        
        if (newRange === DEFAULT_TIME_RANGE) {
          // Remove from URL if it's the default
          params.delete(URL_PARAM_KEY);
        } else {
          params.set(URL_PARAM_KEY, newRange);
        }
        
        const search = params.toString();
        const newUrl = search ? `?${search}` : window.location.pathname;
        window.history.replaceState(null, '', newUrl);
      }
      
      return newRange;
    });
  }, []);
  
  // Handle browser back/forward
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const handlePopstate = () => {
      const params = new URLSearchParams(window.location.search);
      const range = params.get(URL_PARAM_KEY);
      
      if (range && isValidTimeRange(range)) {
        setTimeRangeState(range);
      } else {
        setTimeRangeState(DEFAULT_TIME_RANGE);
      }
    };
    
    window.addEventListener('popstate', handlePopstate);
    return () => window.removeEventListener('popstate', handlePopstate);
  }, []);
  
  return [timeRange, setTimeRange];
}
