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

export type BoardsView = 'grid' | 'list';
const BOARDS_VIEW_KEY = 'syncflow:boards-view';

/** How the dashboard lays out boards. The dense list unless the user switched to cards. */
export function readBoardsView(): BoardsView {
  return localStorage.getItem(BOARDS_VIEW_KEY) === 'grid' ? 'grid' : 'list';
}

export function writeBoardsView(view: BoardsView): void {
  localStorage.setItem(BOARDS_VIEW_KEY, view);
}

const INSPECTOR_KEY = 'syncflow:inspector';

/** Whether the editor's right-hand inspector is shown. On unless the user hid it. */
export function readInspectorOpen(): boolean {
  return localStorage.getItem(INSPECTOR_KEY) !== 'false';
}

export function writeInspectorOpen(open: boolean): void {
  localStorage.setItem(INSPECTOR_KEY, String(open));
}

const SESSION_HINT_KEY = 'syncflow:session';

/**
 * Whether this browser was last signed in: true / false, or null when it has
 * never recorded either (first visit, or from before the hint existed). Lets a
 * signed-out visitor skip the session probe, which the browser would otherwise
 * log as a failed (401) request on every page.
 */
export function readSessionHint(): boolean | null {
  try {
    const v = localStorage.getItem(SESSION_HINT_KEY);
    return v === '1' ? true : v === '0' ? false : null;
  } catch {
    return null;
  }
}

export function writeSessionHint(signedIn: boolean): void {
  try {
    localStorage.setItem(SESSION_HINT_KEY, signedIn ? '1' : '0');
  } catch {
    // Storage blocked: the probe just keeps running, which is still correct.
  }
}

/** The OS-level preference, used only when the user has expressed none. */
export function prefersDark(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}
