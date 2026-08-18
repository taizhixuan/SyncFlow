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
    writeThemePreference(theme);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  const toggle = useCallback(() => setThemeState((t) => (t === 'light' ? 'dark' : 'light')), []);
  const value = useMemo(() => ({ theme, toggle, setTheme }), [theme, toggle, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
