import { beforeEach, describe, expect, it } from 'vitest';
import { createCanvasStore } from './canvas-store';
import { addElements } from '../model/commands';
import { createElement } from '../model/element';
import type { SavedComponent } from '../model/component-lib';

function seedElement(store: ReturnType<typeof createCanvasStore>) {
  const el = createElement('rect', { x: 10, y: 20 }, 1, {
    stroke: 'auto',
    fill: null,
    strokeWidth: 2,
    strokeStyle: 'solid',
    fontSize: 16,
  });
  el.id = 'el-seed';
  store.getState().dispatch(addElements([el]));
  store.getState().setSelected(['el-seed']);
}

describe('saveSelectionAsComponent', () => {
  beforeEach(() => localStorage.clear());

  it('adds a component to the store when elements are selected', () => {
    const store = createCanvasStore('local');
    seedElement(store);
    store.getState().saveSelectionAsComponent('MyComp');
    expect(store.getState().components).toHaveLength(1);
    expect(store.getState().components[0]?.name).toBe('MyComp');
  });

  it('is a no-op when nothing is selected', () => {
    const store = createCanvasStore('local');
    // No selection
    store.getState().saveSelectionAsComponent('Empty');
    expect(store.getState().components).toHaveLength(0);
  });

  it('includes the correct element count in saved component', () => {
    const store = createCanvasStore('local');
    seedElement(store);
    store.getState().saveSelectionAsComponent('Single');
    expect(store.getState().components[0]?.elements).toHaveLength(1);
  });
});

describe('insertComponent', () => {
  beforeEach(() => localStorage.clear());

  it('inserts elements into doc.elements and selects them', () => {
    const store = createCanvasStore('local');
    const comp: SavedComponent = {
      id: 'comp-1',
      name: 'Test',
      elements: [
        {
          id: 'el-1',
          type: 'rect',
          x: 0,
          y: 0,
          rotation: 0,
          opacity: 1,
          zIndex: 1,
          fill: null,
          stroke: '#000',
          strokeWidth: 2,
          strokeStyle: 'solid',
        },
      ],
      createdAt: 0,
    };
    store.getState().insertComponent(comp, { x: 0, y: 0 });
    const docEls = Object.values(store.getState().doc.elements);
    expect(docEls).toHaveLength(1);
    // The inserted element should have a NEW id (not 'el-1')
    expect(docEls[0]?.id).not.toBe('el-1');
    // Should be selected
    expect(store.getState().selected).toHaveLength(1);
  });

  it('inserts elements at the given origin', () => {
    const store = createCanvasStore('local');
    const comp: SavedComponent = {
      id: 'comp-2',
      name: 'Positioned',
      elements: [
        {
          id: 'el-1',
          type: 'rect',
          x: 0,
          y: 0,
          rotation: 0,
          opacity: 1,
          zIndex: 1,
          fill: null,
          stroke: '#000',
          strokeWidth: 2,
          strokeStyle: 'solid',
        },
      ],
      createdAt: 0,
    };
    store.getState().insertComponent(comp, { x: 100, y: 200 });
    const el = Object.values(store.getState().doc.elements)[0];
    expect(el?.x).toBe(100);
    expect(el?.y).toBe(200);
  });

  it('is undoable in a single step', () => {
    const store = createCanvasStore('local');
    const comp: SavedComponent = {
      id: 'comp-3',
      name: 'Undo',
      elements: [
        {
          id: 'el-1',
          type: 'rect',
          x: 0,
          y: 0,
          rotation: 0,
          opacity: 1,
          zIndex: 1,
          fill: null,
          stroke: '#000',
          strokeWidth: 2,
          strokeStyle: 'solid',
        },
      ],
      createdAt: 0,
    };
    store.getState().insertComponent(comp, { x: 0, y: 0 });
    expect(Object.keys(store.getState().doc.elements)).toHaveLength(1);
    store.getState().undo();
    expect(Object.keys(store.getState().doc.elements)).toHaveLength(0);
  });
});

describe('deleteComponent', () => {
  beforeEach(() => localStorage.clear());

  it('removes a component from the store', () => {
    const store = createCanvasStore('local');
    seedElement(store);
    store.getState().saveSelectionAsComponent('ToDelete');
    const id = store.getState().components[0]?.id;
    expect(id).toBeDefined();
    store.getState().deleteComponent(id!);
    expect(store.getState().components).toHaveLength(0);
  });
});
