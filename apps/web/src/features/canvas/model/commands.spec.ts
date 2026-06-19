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
  it('addElements then its inverse removes them', () => {
    const cmd = addElements([rect('a')]);
    const doc1 = cmd.apply(emptyDoc());
    expect(Object.keys(doc1.elements)).toEqual(['a']);
    const back = cmd.invert(emptyDoc()).apply(doc1);
    expect(Object.keys(back.elements)).toEqual([]);
  });
  it('updateElements merges and inverts to the prior values', () => {
    const doc0 = addElements([rect('a', 0)]).apply(emptyDoc());
    const cmd = updateElements({ a: { x: 50 } });
    const doc1 = cmd.apply(doc0);
    expect(doc1.elements.a!.x).toBe(50);
    const back = cmd.invert(doc0).apply(doc1);
    expect(back.elements.a!.x).toBe(0);
  });
  it('removeElements inverts to re-add', () => {
    const doc0 = addElements([rect('a')]).apply(emptyDoc());
    const cmd = removeElements(['a']);
    const doc1 = cmd.apply(doc0);
    expect(doc1.elements.a).toBeUndefined();
    const back = cmd.invert(doc0).apply(doc1);
    expect(back.elements.a).toBeDefined();
  });
});
