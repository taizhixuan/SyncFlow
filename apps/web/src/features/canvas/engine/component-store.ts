import type { SavedComponent } from '../model/component-lib';

const STORAGE_KEY = 'syncflow:component-library';

export function loadComponents(): SavedComponent[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as SavedComponent[];
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
