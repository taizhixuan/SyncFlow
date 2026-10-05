import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  readBoardsView,
  readGridPreference,
  readInspectorOpen,
  readThemePreference,
  writeBoardsView,
  writeGridPreference,
  writeInspectorOpen,
  writeThemePreference,
} from './ui-preferences';

describe('ui preferences', () => {
  beforeEach(() => localStorage.clear());

  it('returns null for a theme that was never chosen', () => {
    expect(readThemePreference()).toBeNull();
  });

  it('round-trips the chosen theme', () => {
    writeThemePreference('light');
    expect(readThemePreference()).toBe('light');
  });

  it('ignores a corrupted theme value rather than returning junk', () => {
    localStorage.setItem('syncflow:theme', 'chartreuse');
    expect(readThemePreference()).toBeNull();
  });

  it('defaults the grid to off and round-trips it', () => {
    expect(readGridPreference()).toBe(false);
    writeGridPreference(true);
    expect(readGridPreference()).toBe(true);
  });
});

describe('ui preferences when storage is blocked', () => {
  // "Block site data" makes every localStorage access throw a SecurityError;
  // the theme is read during the first render, so a throw blanked the app.
  let getItem: { mockRestore(): void };
  let setItem: { mockRestore(): void };
  beforeEach(() => {
    const blocked = (): never => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    };
    getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked);
    setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked);
  });
  afterEach(() => {
    getItem.mockRestore();
    setItem.mockRestore();
  });

  it('reads fall back to their defaults', () => {
    expect(readThemePreference()).toBeNull();
    expect(readGridPreference()).toBe(false);
    expect(readBoardsView()).toBe('list');
    expect(readInspectorOpen()).toBe(true);
  });

  it('writes are dropped instead of throwing', () => {
    expect(() => writeThemePreference('dark')).not.toThrow();
    expect(() => writeGridPreference(true)).not.toThrow();
    expect(() => writeBoardsView('grid')).not.toThrow();
    expect(() => writeInspectorOpen(false)).not.toThrow();
  });
});
