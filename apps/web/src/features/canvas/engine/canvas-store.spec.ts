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

  it('duplicates the selection (offset, new ids, selected, undoable)', () => {
    const store = createCanvasStore('local');
    store.getState().dispatch(addElements([rect('a')]));
    store.getState().duplicate(['a']);
    const ids = Object.keys(store.getState().doc.elements);
    expect(ids).toHaveLength(2);
    expect(store.getState().selected).toHaveLength(1);
    expect(store.getState().selected[0]).not.toBe('a');
    store.getState().undo();
    expect(Object.keys(store.getState().doc.elements)).toEqual(['a']);
  });

  it('bringToFront raises z-index above all others', () => {
    const store = createCanvasStore('local');
    store.getState().dispatch(addElements([{ ...rect('a'), zIndex: 0 }, { ...rect('b'), zIndex: 5 }]));
    store.getState().bringToFront(['a']);
    expect(store.getState().doc.elements.a!.zIndex).toBeGreaterThan(5);
  });

  it('groups elements under a shared id and ungroups them', () => {
    const store = createCanvasStore('local');
    store.getState().dispatch(addElements([rect('a'), rect('b')]));
    store.getState().group(['a', 'b']);
    const gid = store.getState().doc.elements.a!.groupId;
    expect(gid).toBeTruthy();
    expect(store.getState().doc.elements.b!.groupId).toBe(gid);
    store.getState().ungroup(['a']);
    expect(store.getState().doc.elements.a!.groupId).toBeUndefined();
    expect(store.getState().doc.elements.b!.groupId).toBeUndefined();
  });

  it('selecting one grouped element selects the whole group', () => {
    const store = createCanvasStore('local');
    store.getState().dispatch(addElements([rect('a'), rect('b'), rect('c')]));
    store.getState().group(['a', 'b']);
    store.getState().selectElement('a', false);
    expect(store.getState().selected.sort()).toEqual(['a', 'b']);
    store.getState().selectElement('c', false);
    expect(store.getState().selected).toEqual(['c']);
  });

  it('alignSelection left-aligns the selected elements (undoable)', () => {
    const store = createCanvasStore('local');
    store.getState().dispatch(addElements([
      { ...rect('a'), x: 10, width: 40, height: 20 },
      { ...rect('b'), x: 100, width: 40, height: 20 },
    ]));
    store.getState().setSelected(['a', 'b']);
    store.getState().alignSelection('left');
    expect(store.getState().doc.elements.a!.x).toBe(10);
    expect(store.getState().doc.elements.b!.x).toBe(10);
    store.getState().undo();
    expect(store.getState().doc.elements.b!.x).toBe(100);
  });
});
