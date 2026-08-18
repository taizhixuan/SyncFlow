/**
 * User-level UI preferences kept in localStorage.
 *
 * These are per-person, not per-board: the theme drives both the app chrome
 * (via the `dark` class) and the canvas colours, so it needs exactly one home.
 * Board records used to carry their own theme, which let whichever board you
 * opened last overwrite the choice you made everywhere else.
 */
export type ThemePreference = 'light' | 'dark';

const THEME_KEY = 'syncflow:theme';
const GRID_KEY = 'syncflow:grid';

/** The theme the user picked, or null if they never picked one. */
export function readThemePreference(): ThemePreference | null {
  const raw = localStorage.getItem(THEME_KEY);
  return raw === 'light' || raw === 'dark' ? raw : null;
}

export function writeThemePreference(theme: ThemePreference): void {
  localStorage.setItem(THEME_KEY, theme);
}

/** Whether the canvas grid is on. Off unless the user turned it on. */
export function readGridPreference(): boolean {
  return localStorage.getItem(GRID_KEY) === 'true';
}

export function writeGridPreference(enabled: boolean): void {
  localStorage.setItem(GRID_KEY, String(enabled));
}

/** The OS-level preference, used only when the user has expressed none. */
export function prefersDark(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}
