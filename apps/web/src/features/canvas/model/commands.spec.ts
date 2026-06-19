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
