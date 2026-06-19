import { describe, expect, it } from 'vitest';
import type { CanvasElement } from '@syncflow/shared';
import {
  addElement,
  bringToFront,
  emptyDocument,
  nextZIndex,
  orderedElements,
  removeElements,
  updateElement,
} from './canvas-document';

function rect(id: string, overrides: Partial<CanvasElement> = {}): CanvasElement {
  return {
    id,
    type: 'rect',
    x: 0,
    y: 0,
    rotation: 0,
    opacity: 1,
    zIndex: 0,
    fill: '#fff',
    stroke: '#1A1A22',
    strokeWidth: 2,
    width: 100,
    height: 80,
    ...overrides,
  };
}

describe('canvas-document', () => {
  it('starts empty with a zero next z-index', () => {
    const doc = emptyDocument();
    expect(orderedElements(doc)).toHaveLength(0);
    expect(nextZIndex(doc)).toBe(0);
  });

  it('adds an element without mutating the original document', () => {
    const doc = emptyDocument();
    const next = addElement(doc, rect('a'));
    expect(orderedElements(doc)).toHaveLength(0);
    expect(orderedElements(next).map((e) => e.id)).toEqual(['a']);
  });

  it('orders elements by ascending z-index', () => {
    let doc = emptyDocument();
    doc = addElement(doc, rect('a', { zIndex: 2 }));
    doc = addElement(doc, rect('b', { zIndex: 1 }));
    expect(orderedElements(doc).map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('nextZIndex is one above the current maximum', () => {
    let doc = emptyDocument();
    doc = addElement(doc, rect('a', { zIndex: 5 }));
    expect(nextZIndex(doc)).toBe(6);
  });

  it('updates an element by merging a patch', () => {
    let doc = emptyDocument();
    doc = addElement(doc, rect('a', { x: 0, y: 0 }));
    doc = updateElement(doc, 'a', { x: 40, y: 25 });
    const el = orderedElements(doc)[0]!;
    expect(el.x).toBe(40);
    expect(el.y).toBe(25);
    expect(el.width).toBe(100);
  });

  it('ignores updates to a missing element', () => {
    const doc = addElement(emptyDocument(), rect('a'));
    const next = updateElement(doc, 'missing', { x: 999 });
    expect(orderedElements(next)).toEqual(orderedElements(doc));
  });

  it('removes elements by id', () => {
    let doc = emptyDocument();
    doc = addElement(doc, rect('a'));
    doc = addElement(doc, rect('b'));
    doc = removeElements(doc, ['a']);
    expect(orderedElements(doc).map((e) => e.id)).toEqual(['b']);
  });

  it('brings an element to the front above all others', () => {
    let doc = emptyDocument();
    doc = addElement(doc, rect('a', { zIndex: 0 }));
    doc = addElement(doc, rect('b', { zIndex: 1 }));
    doc = bringToFront(doc, 'a');
    expect(orderedElements(doc).map((e) => e.id)).toEqual(['b', 'a']);
  });
});
