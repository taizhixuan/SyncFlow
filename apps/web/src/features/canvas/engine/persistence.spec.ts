import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasElement } from '@syncflow/shared';
import { loadBoard, saveBoard } from './persistence';

const rect = (id: string): CanvasElement =>
  ({ id, type: 'rect', x: 1, y: 2, width: 3, height: 4 }) as CanvasElement;

describe('persistence', () => {
  beforeEach(() => localStorage.clear());
  it('returns null when nothing is saved', () => {
    expect(loadBoard('local')).toBeNull();
  });
  it('round-trips a document and theme', () => {
    saveBoard('local', { elements: { a: rect('a') } }, 'dark');
    const loaded = loadBoard('local');
    expect(loaded?.theme).toBe('dark');
    expect(loaded?.doc.elements.a?.id).toBe('a');
  });
  it('drops malformed elements and a bogus theme from a stored board', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem(
      'syncflow:board:local',
      JSON.stringify({
        doc: { elements: { a: rect('a'), bad: { id: 'bad', type: 'line', x: 0, y: 0, points: 'x' } } },
        theme: 'neon',
      }),
    );
    const loaded = loadBoard('local');
    expect(Object.keys(loaded?.doc.elements ?? {})).toEqual(['a']);
    expect(loaded?.theme).toBeUndefined();
    warn.mockRestore();
  });

  it('returns null for a stored value that is not a board', () => {
    localStorage.setItem('syncflow:board:local', JSON.stringify([1, 2]));
    expect(loadBoard('local')).toBeNull();
  });
});
