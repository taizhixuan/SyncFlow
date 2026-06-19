import { beforeEach, describe, expect, it } from 'vitest';
import type { CanvasElement } from '@syncflow/shared';
import { addElements } from '../model/commands';
import { createCanvasStore } from './canvas-store';

const rect = (id: string): CanvasElement =>
  ({
    id,
    type: 'rect',
    x: 0,
    y: 0,
    rotation: 0,
    opacity: 1,
    zIndex: 0,
    fill: null,
    stroke: 'auto',
    strokeWidth: 2,
  }) as CanvasElement;

describe('canvas store', () => {
  beforeEach(() => localStorage.clear());
  it('dispatches a command and supports undo/redo', () => {
    const store = createCanvasStore('local');
    store.getState().dispatch(addElements([rect('a')]));
    expect(Object.keys(store.getState().doc.elements)).toEqual(['a']);
    store.getState().undo();
    expect(Object.keys(store.getState().doc.elements)).toEqual([]);
    store.getState().redo();
    expect(Object.keys(store.getState().doc.elements)).toEqual(['a']);
  });
  it('toggles theme', () => {
    const store = createCanvasStore('local');
    const before = store.getState().theme;
    store.getState().toggleTheme();
    expect(store.getState().theme).not.toBe(before);
  });
  it('recolors the current selection via a command (undoable)', () => {
    const store = createCanvasStore('local');
    store.getState().dispatch(addElements([rect('a')]));
    store.getState().setSelected(['a']);
    store.getState().recolorSelection({ stroke: '#FF5A5F' });
    expect(store.getState().doc.elements.a!.stroke).toBe('#FF5A5F');
    store.getState().undo();
    expect(store.getState().doc.elements.a!.stroke).toBe('auto');
  });
});
