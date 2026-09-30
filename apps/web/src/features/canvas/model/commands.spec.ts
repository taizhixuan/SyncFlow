import { describe, expect, it } from 'vitest';
import type { CanvasElement } from '@syncflow/shared';
import { addElements, updateElements, removeElements, emptyDoc } from './commands';

const rect = (id: string, x = 0): CanvasElement =>
  ({
    id,
    type: 'rect',
    x,
    y: 0,
    rotation: 0,
    opacity: 1,
    zIndex: 0,
    fill: null,
    stroke: 'auto',
    strokeWidth: 2,
  }) as CanvasElement;

describe('commands', () => {
  it('addElements adds elements to the doc', () => {
    const cmd = addElements([rect('a')]);
    const doc1 = cmd.apply(emptyDoc());
    expect(Object.keys(doc1.elements)).toEqual(['a']);
  });
  it('updateElements merges a patch into an existing element', () => {
    const doc0 = addElements([rect('a', 0)]).apply(emptyDoc());
    const doc1 = updateElements({ a: { x: 50 } }).apply(doc0);
    expect(doc1.elements.a!.x).toBe(50);
  });
  it('removeElements deletes elements from the doc', () => {
    const doc0 = addElements([rect('a')]).apply(emptyDoc());
    const doc1 = removeElements(['a']).apply(doc0);
    expect(doc1.elements.a).toBeUndefined();
  });
});

describe('removeElements and connectors', () => {
  const box = (id: string, x: number): CanvasElement => ({ ...rect(id, x), width: 100, height: 100 });
  const conn = {
    id: 'c', type: 'connector', x: 0, y: 0, rotation: 0, opacity: 1, zIndex: 1, fill: null,
    stroke: 'auto', strokeWidth: 2, from: { elementId: 'a' }, to: { elementId: 'b' },
  } as CanvasElement;

  it('pins a surviving connector bound end to where it was drawn', () => {
    const doc0 = addElements([box('a', 0), box('b', 300), conn]).apply(emptyDoc());
    const doc1 = removeElements(['b']).apply(doc0);
    const c = doc1.elements.c!;
    expect(c.to?.elementId).toBeUndefined();
    expect(c.to).toEqual({ x: 300, y: 50 });
    expect(c.from).toEqual({ elementId: 'a' }); // live binding untouched
  });

  it('leaves connectors alone when they are deleted too', () => {
    const doc0 = addElements([box('a', 0), box('b', 300), conn]).apply(emptyDoc());
    const doc1 = removeElements(['b', 'c']).apply(doc0);
    expect(doc1.elements.c).toBeUndefined();
    expect(doc1.elements.a).toBe(doc0.elements.a);
  });
});
