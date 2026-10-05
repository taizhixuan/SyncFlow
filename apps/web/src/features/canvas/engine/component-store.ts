import type { SavedComponent } from '../model/component-lib';

const STORAGE_KEY = 'syncflow:component-library';

/** Light runtime guard — drops any entry that doesn't have the expected shape. */
function isSavedComponent(v: unknown): v is SavedComponent {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj['id'] === 'string' &&
    typeof obj['name'] === 'string' &&
    Array.isArray(obj['elements']) &&
    typeof obj['createdAt'] === 'number'
  );
}

/**
 * With site data blocked even reading `window.localStorage` throws, so every
 * access sits inside a try.
 */
export function loadComponents(): SavedComponent[] {
  try {
    if (typeof window === 'undefined') return [];
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as unknown[]).filter(isSavedComponent);
  } catch {
    return [];
  }
}

/** False when the browser refused the write (quota exceeded or site data blocked). */
export function saveComponents(list: SavedComponent[]): boolean {
  try {
    if (typeof window === 'undefined') return false;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export function addComponent(list: SavedComponent[], comp: SavedComponent): SavedComponent[] {
  return [...list, comp];
}

export function removeComponent(list: SavedComponent[], id: string): SavedComponent[] {
  return list.filter((c) => c.id !== id);
}
