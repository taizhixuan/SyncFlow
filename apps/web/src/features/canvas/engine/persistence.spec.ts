import { beforeEach, describe, expect, it } from 'vitest';
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
});
