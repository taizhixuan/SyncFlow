import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { prefersDark, readThemePreference, writeThemePreference, type ThemePreference } from '@/lib/ui-preferences';

type Theme = ThemePreference;
interface ThemeContextValue {
  theme: Theme;
  toggle(): void;
  setTheme(t: Theme): void;
}
const ThemeContext = createContext<ThemeContextValue | null>(null);

function initial(): Theme {
  return readThemePreference() ?? (prefersDark() ? 'dark' : 'light');
}

export function ThemeProvider({ children }: { children: ReactNode }): JSX.Element {
  const [theme, setThemeState] = useState<Theme>(initial);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    // Tint the mobile browser's own toolbar to match the app chrome.
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0E0E12' : '#FFFFFF');
  }, [theme]);

  // Until the user picks a theme, keep following the OS (e.g. a light/dark
  // schedule). Only an explicit choice is saved; saving the OS-derived default
  // on mount would freeze it at whatever the OS said on the first visit.
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!media) return;
    const follow = (e: MediaQueryListEvent): void => {
      if (readThemePreference() === null) setThemeState(e.matches ? 'dark' : 'light');
    };
    media.addEventListener('change', follow);
    return () => media.removeEventListener('change', follow);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    writeThemePreference(t);
    setThemeState(t);
  }, []);
  const toggle = useCallback(() => {
    setThemeState((t) => {
      const next = t === 'light' ? 'dark' : 'light';
      writeThemePreference(next);
      return next;
    });
  }, []);
  const value = useMemo(() => ({ theme, toggle, setTheme }), [theme, toggle, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
