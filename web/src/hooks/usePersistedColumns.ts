import { useState, useEffect, useCallback } from 'react';
import type { ColumnConfig } from '../types';
import { DEFAULT_COLUMNS } from '../types';

const STORAGE_KEY = 'logtail-columns';

export function usePersistedColumns() {
  const [columns, setColumnsState] = useState<ColumnConfig[]>(() => {
    // Load from localStorage on initial render
    if (typeof window === 'undefined') return DEFAULT_COLUMNS;
    
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as ColumnConfig[];
        // Validate and merge with defaults (in case new columns were added)
        return mergeWithDefaults(parsed);
      }
    } catch (e) {
      console.error('Failed to load columns from localStorage:', e);
    }
    
    return DEFAULT_COLUMNS;
  });

  // Save to localStorage whenever columns change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(columns));
    } catch (e) {
      console.error('Failed to save columns to localStorage:', e);
    }
  }, [columns]);

  const setColumns = useCallback((newColumns: ColumnConfig[]) => {
    setColumnsState(newColumns);
  }, []);

  const resetColumns = useCallback(() => {
    setColumnsState(DEFAULT_COLUMNS);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.error('Failed to remove columns from localStorage:', e);
    }
  }, []);

  return { columns, setColumns, resetColumns };
}

// Merge stored columns with defaults to handle schema changes
function mergeWithDefaults(stored: ColumnConfig[]): ColumnConfig[] {
  const storedMap = new Map(stored.map(c => [c.key, c]));
  const result: ColumnConfig[] = [];
  
  // First, add stored columns in their saved order
  for (const col of stored) {
    const defaultCol = DEFAULT_COLUMNS.find(d => d.key === col.key);
    if (defaultCol) {
      result.push({
        ...defaultCol,
        visible: col.visible,
        width: col.width || defaultCol.width,
      });
    }
  }
  
  // Then, add any new columns from defaults that weren't in stored
  for (const defaultCol of DEFAULT_COLUMNS) {
    if (!storedMap.has(defaultCol.key)) {
      result.push(defaultCol);
    }
  }
  
  return result;
}
