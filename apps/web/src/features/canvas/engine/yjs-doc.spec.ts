import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import type { CanvasElement } from '@syncflow/shared';
import { addElements, updateElements, removeElements } from '../model/commands';
import { createYDoc, toPlainDoc, applyCommandToY, LOCAL_ORIGIN } from './yjs-doc';

function rect(id: string): CanvasElement {
  return {
    id, type: 'rect', x: 0, y: 0, width: 10, height: 10, zIndex: 1,
    stroke: 'auto', fill: null, strokeWidth: 2, strokeStyle: 'solid',
  } as unknown as CanvasElement;
}

describe('yjs-doc binding', () => {
  it('adds an element into the Y.Map and projects it back', () => {
    const { ydoc, elements } = createYDoc();
    applyCommandToY(ydoc, elements, addElements([rect('a')]), LOCAL_ORIGIN);
    const doc = toPlainDoc(elements);
    expect(doc.elements.a?.id).toBe('a');
    expect(doc.elements.a?.width).toBe(10);
  });

  it('updates only the changed field (field-level merge)', () => {
    const { ydoc, elements } = createYDoc();
    applyCommandToY(ydoc, elements, addElements([rect('a')]), LOCAL_ORIGIN);
    applyCommandToY(ydoc, elements, updateElements({ a: { x: 99 } }), LOCAL_ORIGIN);
    const inner = elements.get('a')!;
    expect(inner.get('x')).toBe(99);
    expect(inner.get('width')).toBe(10); // untouched
  });

  it('removes an element', () => {
    const { ydoc, elements } = createYDoc();
    applyCommandToY(ydoc, elements, addElements([rect('a')]), LOCAL_ORIGIN);
    applyCommandToY(ydoc, elements, removeElements(['a']), LOCAL_ORIGIN);
    expect(toPlainDoc(elements).elements.a).toBeUndefined();
  });

  it('converges two docs on concurrent edits to different fields', () => {
    const A = createYDoc();
    const B = createYDoc();
    applyCommandToY(A.ydoc, A.elements, addElements([rect('a')]), LOCAL_ORIGIN);
    // seed B from A
    Y.applyUpdate(B.ydoc, Y.encodeStateAsUpdate(A.ydoc));
    // concurrent: A moves x, B recolors stroke
    applyCommandToY(A.ydoc, A.elements, updateElements({ a: { x: 50 } }), LOCAL_ORIGIN);
    applyCommandToY(B.ydoc, B.elements, updateElements({ a: { stroke: '#f00' } }), LOCAL_ORIGIN);
    // exchange
    Y.applyUpdate(A.ydoc, Y.encodeStateAsUpdate(B.ydoc));
    Y.applyUpdate(B.ydoc, Y.encodeStateAsUpdate(A.ydoc));
    const a = toPlainDoc(A.elements).elements.a!;
    const b = toPlainDoc(B.elements).elements.a!;
    expect(a.x).toBe(50);
    expect((a as Record<string, unknown>).stroke).toBe('#f00');
    expect(b).toEqual(a);
  });
});

describe('toPlainDoc referential identity', () => {
  it('reuses the previous object for elements that did not change', () => {
    const { ydoc, elements } = createYDoc();
    applyCommandToY(ydoc, elements, addElements([rect('a'), rect('b')]), LOCAL_ORIGIN);

    const first = toPlainDoc(elements);
    applyCommandToY(ydoc, elements, updateElements({ a: { x: 50 } }), LOCAL_ORIGIN);
    const second = toPlainDoc(elements, first);

    // The edited element is a new object; the untouched one is the SAME object,
    // which is what lets memo(ElementView) skip it.
    expect(second.elements.a).not.toBe(first.elements.a);
    expect(second.elements.a?.x).toBe(50);
    expect(second.elements.b).toBe(first.elements.b);
  });

  it('reuses every element when nothing changed at all', () => {
    const { ydoc, elements } = createYDoc();
    applyCommandToY(ydoc, elements, addElements([rect('a'), rect('b')]), LOCAL_ORIGIN);

    const first = toPlainDoc(elements);
    const second = toPlainDoc(elements, first);
    expect(second.elements.a).toBe(first.elements.a);
    expect(second.elements.b).toBe(first.elements.b);
  });

  it('still produces a fresh object when a compound field changes', () => {
    const { ydoc, elements } = createYDoc();
    applyCommandToY(ydoc, elements, addElements([rect('a')]), LOCAL_ORIGIN);

    const first = toPlainDoc(elements);
    applyCommandToY(ydoc, elements, updateElements({ a: { points: [1, 2, 3] } }), LOCAL_ORIGIN);
    const second = toPlainDoc(elements, first);

    expect(second.elements.a).not.toBe(first.elements.a);
    expect(second.elements.a?.points).toEqual([1, 2, 3]);
  });

  it('drops elements removed since the previous projection', () => {
    const { ydoc, elements } = createYDoc();
    applyCommandToY(ydoc, elements, addElements([rect('a'), rect('b')]), LOCAL_ORIGIN);
    const first = toPlainDoc(elements);
    applyCommandToY(ydoc, elements, removeElements(['a']), LOCAL_ORIGIN);
    const second = toPlainDoc(elements, first);

    expect(second.elements.a).toBeUndefined();
    expect(second.elements.b).toBe(first.elements.b);
  });
});
