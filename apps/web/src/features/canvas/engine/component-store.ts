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

export function loadComponents(): SavedComponent[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as unknown[]).filter(isSavedComponent);
  } catch {
    return [];
  }
}

export function saveComponents(list: SavedComponent[]): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function addComponent(list: SavedComponent[], comp: SavedComponent): SavedComponent[] {
  return [...list, comp];
}

export function removeComponent(list: SavedComponent[], id: string): SavedComponent[] {
  return list.filter((c) => c.id !== id);
}
