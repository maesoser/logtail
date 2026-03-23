import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'logtail-dark-mode';

export function useDarkMode() {
  // Initialize from localStorage or system preference
  const [isDark, setIsDark] = useState<boolean>(() => {
    // Check localStorage first
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      return stored === 'true';
    }
    // Fall back to system preference
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  // Apply dark mode using data-mode attribute (Kumo semantic tokens handle theming)
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-mode', isDark ? 'dark' : 'light');
    // Persist to localStorage
    localStorage.setItem(STORAGE_KEY, String(isDark));
  }, [isDark]);

  // Listen for system preference changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      // Only auto-switch if user hasn't manually set preference
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === null) {
        setIsDark(e.matches);
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const toggle = useCallback(() => {
    setIsDark(prev => !prev);
  }, []);

  return { isDark, toggle };
}
