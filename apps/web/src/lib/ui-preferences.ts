/**
 * User-level UI preferences kept in localStorage.
 *
 * These are per-person, not per-board: the theme drives both the app chrome
 * (via the `dark` class) and the canvas colours, so it needs exactly one home.
 * Board records used to carry their own theme, which let whichever board you
 * opened last overwrite the choice you made everywhere else.
 */
export type ThemePreference = 'light' | 'dark';

/**
 * localStorage throws (SecurityError) when the browser blocks site data, and the
 * theme is read during the very first render, so an unguarded read blanked the
 * whole app. Preferences are conveniences: a blocked read falls back to the
 * default and a blocked write is dropped.
 */
function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Blocked or full: the preference just doesn't persist.
  }
}

const THEME_KEY = 'syncflow:theme';
const GRID_KEY = 'syncflow:grid';

/** The theme the user picked, or null if they never picked one. */
export function readThemePreference(): ThemePreference | null {
  const raw = read(THEME_KEY);
  return raw === 'light' || raw === 'dark' ? raw : null;
}

export function writeThemePreference(theme: ThemePreference): void {
  write(THEME_KEY, theme);
}

/** Whether the canvas grid is on. Off unless the user turned it on. */
export function readGridPreference(): boolean {
  return read(GRID_KEY) === 'true';
}

export function writeGridPreference(enabled: boolean): void {
  write(GRID_KEY, String(enabled));
}

export type BoardsView = 'grid' | 'list';
const BOARDS_VIEW_KEY = 'syncflow:boards-view';

/** How the dashboard lays out boards. The dense list unless the user switched to cards. */
export function readBoardsView(): BoardsView {
  return read(BOARDS_VIEW_KEY) === 'grid' ? 'grid' : 'list';
}

export function writeBoardsView(view: BoardsView): void {
  write(BOARDS_VIEW_KEY, view);
}

const INSPECTOR_KEY = 'syncflow:inspector';

/** Whether the editor's right-hand inspector is shown. On unless the user hid it. */
export function readInspectorOpen(): boolean {
  return read(INSPECTOR_KEY) !== 'false';
}

export function writeInspectorOpen(open: boolean): void {
  write(INSPECTOR_KEY, String(open));
}

const SESSION_HINT_KEY = 'syncflow:session';

/**
 * Whether this browser was last signed in: true / false, or null when it has
 * never recorded either (first visit, or from before the hint existed). Lets a
 * signed-out visitor skip the session probe, which the browser would otherwise
 * log as a failed (401) request on every page.
 */
export function readSessionHint(): boolean | null {
  const v = read(SESSION_HINT_KEY);
  return v === '1' ? true : v === '0' ? false : null;
}

export function writeSessionHint(signedIn: boolean): void {
  // Storage blocked: the probe just keeps running, which is still correct.
  write(SESSION_HINT_KEY, signedIn ? '1' : '0');
}

/** The OS-level preference, used only when the user has expressed none. */
export function prefersDark(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}
