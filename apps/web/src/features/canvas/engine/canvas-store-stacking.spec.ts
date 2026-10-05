import { beforeEach, describe, expect, it } from 'vitest';
import type { CanvasElement } from '@syncflow/shared';
import { addElements } from '../model/commands';
import { compareZ } from '../model/element';
import { groupPath } from '../model/group';
import { createCanvasStore, type CanvasStore } from './canvas-store';

const rect = (id: string, overrides: Partial<CanvasElement> = {}): CanvasElement =>
  ({
    id,
    type: 'rect',
    x: 0,
    y: 0,
    width: 50,
    height: 50,
    rotation: 0,
    opacity: 1,
    zIndex: 0,
    fill: null,
    stroke: 'auto',
    strokeWidth: 2,
    ...overrides,
  }) as CanvasElement;

function seeded(els: CanvasElement[]): CanvasStore {
  const store = createCanvasStore('local');
  store.getState().dispatch(addElements(els));
  return store;
}

/** Ids in paint order, bottom first. */
function paintOrder(store: CanvasStore): string[] {
  return Object.values(store.getState().doc.elements)
    .sort(compareZ)
    .map((e) => e.id);
}

describe('bring to front / send to back keep the selection’s own stacking', () => {
  beforeEach(() => localStorage.clear());
  const board = (): CanvasElement[] => [
    rect('a', { zIndex: 1 }),
    rect('b', { zIndex: 2 }),
    rect('c', { zIndex: 3 }),
    rect('d', { zIndex: 4 }),
  ];

  it('send to back keeps B above A', () => {
    const store = seeded(board());
    store.getState().sendToBack(['b', 'c']);
    expect(paintOrder(store)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('send to back ignores the order the ids were selected in', () => {
    const store = seeded(board());
    store.getState().sendToBack(['c', 'b']);
    expect(paintOrder(store)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('bring to front keeps the selection’s order whatever order it was picked in', () => {
    const store = seeded(board());
    store.getState().bringToFront(['c', 'a']);
    expect(paintOrder(store)).toEqual(['b', 'd', 'a', 'c']);
  });
});

describe('copies stack above everything already on the board', () => {
  beforeEach(() => localStorage.clear());

  it('duplicate puts the copies on top, in the originals’ order', () => {
    const store = seeded([rect('a', { zIndex: 1 }), rect('b', { zIndex: 2 }), rect('top', { zIndex: 9 })]);
    store.getState().duplicate(['a', 'b']);
    const order = paintOrder(store);
    const [copyA, copyB] = order.slice(3);
    expect(order.slice(0, 3)).toEqual(['a', 'b', 'top']);
    expect(store.getState().doc.elements[copyA!]?.x).toBe(16);
    expect(store.getState().selected).toContain(copyB);
  });

  it('a duplicate of an element sharing z with the original never renders under it', () => {
    const store = seeded([rect('zzzz', { zIndex: 0 })]);
    store.getState().duplicate(['zzzz']);
    expect(paintOrder(store)[0]).toBe('zzzz');
  });

  it('an inserted template sits above existing content, its frames still below its own notes', () => {
    const store = seeded([rect('existing', { zIndex: 5 })]);
    store.getState().insertTemplate('retro', { x: 0, y: 0 });
    const order = paintOrder(store);
    expect(order[0]).toBe('existing');
    const els = store.getState().doc.elements;
    const kinds = order.slice(1).map((id) => els[id]!.type);
    expect(kinds.lastIndexOf('frame')).toBeLessThan(kinds.indexOf('sticky'));
  });

  it('an inserted component sits above existing content', () => {
    const store = seeded([rect('existing', { zIndex: 50 })]);
    store.getState().insertComponent(
      { id: 'c', name: 'C', createdAt: 0, elements: [rect('p', { zIndex: 0 }), rect('q', { zIndex: 1 })] },
      { x: 0, y: 0 },
    );
    expect(paintOrder(store)[0]).toBe('existing');
  });
});

describe('clusterByTag keeps the group tree valid', () => {
  beforeEach(() => localStorage.clear());

  it('keeps a wholly tagged subgroup nested inside the cluster', () => {
    const store = seeded([
      rect('a', { tags: ['t'], groupPath: ['I'], groupId: 'I' }),
      rect('b', { tags: ['t'], groupPath: ['I'], groupId: 'I' }),
      rect('c', { tags: ['t'], x: 300 }),
    ]);
    store.getState().clusterByTag('t');
    const els = store.getState().doc.elements;
    const outer = groupPath(els['c'])[0]!;
    expect(groupPath(els['a'])).toEqual([outer, 'I']);
    expect(groupPath(els['b'])).toEqual([outer, 'I']);
    expect(els['a']?.groupId).toBe(outer);
  });

  it('does not strand an untagged sibling as a group of one', () => {
    const store = seeded([
      rect('a', { tags: ['t'], groupPath: ['G'], groupId: 'G' }),
      rect('loner', { groupPath: ['G'], groupId: 'G' }),
      rect('c', { tags: ['t'], x: 300 }),
    ]);
    store.getState().clusterByTag('t');
    const els = store.getState().doc.elements;
    expect(groupPath(els['loner'])).toEqual([]);
    expect(els['loner']?.groupId).toBeUndefined();
    expect(groupPath(els['a'])).toEqual(groupPath(els['c']));
  });

  it('leaves untagged siblings grouped when two or more remain', () => {
    const store = seeded([
      rect('a', { tags: ['t'], groupPath: ['G'], groupId: 'G' }),
      rect('u1', { groupPath: ['G'], groupId: 'G' }),
      rect('u2', { groupPath: ['G'], groupId: 'G' }),
      rect('c', { tags: ['t'], x: 300 }),
    ]);
    store.getState().clusterByTag('t');
    const els = store.getState().doc.elements;
    expect(groupPath(els['u1'])).toEqual(['G']);
    expect(groupPath(els['u2'])).toEqual(['G']);
  });

  it('adds no wrapper when every tagged element is already one group', () => {
    const store = seeded([
      rect('a', { tags: ['t'], groupPath: ['G'], groupId: 'G' }),
      rect('b', { tags: ['t'], groupPath: ['G'], groupId: 'G', x: 300 }),
    ]);
    store.getState().clusterByTag('t');
    expect(groupPath(store.getState().doc.elements['a'])).toEqual(['G']);
  });
});
