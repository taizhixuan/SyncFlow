import { beforeEach, describe, expect, it } from 'vitest';
import { readGridPreference, readThemePreference, writeGridPreference, writeThemePreference } from './ui-preferences';

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
