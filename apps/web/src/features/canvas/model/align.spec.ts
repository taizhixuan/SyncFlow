import { describe, expect, it } from 'vitest';
import type { CanvasElement } from '@syncflow/shared';
import { align, distribute } from './align';

const box = (id: string, x: number, y: number, w = 40, h = 20): CanvasElement =>
  ({ id, type: 'rect', x, y, width: w, height: h }) as CanvasElement;

describe('align', () => {
  it('aligns left edges to the leftmost element', () => {
    const patches = align([box('a', 10, 0), box('b', 100, 50)], 'left');
    expect(patches.a!.x).toBe(10);
    expect(patches.b!.x).toBe(10);
  });

  it('aligns horizontal centers', () => {
    const patches = align([box('a', 0, 0, 40, 20), box('b', 0, 100, 80, 20)], 'centerX');
    // selection center x: min left 0, max right 80 -> center 40; a center should land at 40 => x=20
    expect(patches.a!.x).toBe(20);
    expect(patches.b!.x).toBe(0);
  });

  it('aligns bottom edges to the lowest element', () => {
    const patches = align([box('a', 0, 0, 40, 20), box('b', 0, 100, 40, 40)], 'bottom');
    // lowest bottom = 140; a bottom should be 140 => y = 120
    expect(patches.a!.y).toBe(120);
    expect(patches.b!.y).toBe(100);
  });
});

describe('distribute', () => {
  it('evenly spaces horizontal centers between the extremes', () => {
    const patches = distribute(
      [box('a', 0, 0, 20, 20), box('b', 30, 0, 20, 20), box('c', 200, 0, 20, 20)],
      'horizontal',
    );
    // centers: a=10, c=210 fixed; b center should be midway -> 110 => x = 100
    expect(patches.b!.x).toBe(100);
    expect(patches.a).toBeUndefined();
    expect(patches.c).toBeUndefined();
  });
});

describe('align/distribute ignore connectors', () => {
  const conn = { id: 'c', type: 'connector', x: 0, y: 0, from: { elementId: 'a' }, to: { elementId: 'b' } } as CanvasElement;
  it('does not let a connector drag the alignment edge to the origin', () => {
    const patches = align([box('a', 500, 500), box('b', 600, 700), conn], 'left');
    expect(patches.a!.x).toBe(500);
    expect(patches.b!.x).toBe(500);
    expect(patches.c).toBeUndefined();
  });
  it('does not distribute connectors', () => {
    const patches = distribute([box('a', 500, 0), box('b', 600, 0), box('d', 900, 0), conn], 'horizontal');
    expect(patches.c).toBeUndefined();
    expect(patches.b).toBeDefined();
  });
});

describe('align/distribute move groups as units', () => {
  const member = (id: string, x: number, y: number, g = 'G'): CanvasElement =>
    ({ ...box(id, x, y), groupPath: [g], groupId: g }) as CanvasElement;

  it('aligns a group by its union bounds, keeping its members’ layout', () => {
    const patches = align([member('g1', 100, 0), member('g2', 200, 50), box('c', 10, 300)], 'left');
    expect(patches.g1!.x).toBe(10);
    expect(patches.g2!.x).toBe(110);
    expect(patches.c!.x).toBe(10);
  });

  it('carries a free arrow inside the group along with it', () => {
    const arrow = {
      id: 'arr',
      type: 'connector',
      x: 0,
      y: 0,
      from: { x: 120, y: 10 },
      to: { x: 180, y: 10 },
      groupPath: ['G'],
      groupId: 'G',
    } as CanvasElement;
    const patches = align([member('g1', 100, 0), member('g2', 200, 50), arrow, box('c', 10, 300)], 'left');
    expect(patches.arr).toMatchObject({ from: { x: 30, y: 10 }, to: { x: 90, y: 10 } });
  });

  it('distributes groups as single units', () => {
    const patches = distribute(
      [box('a', 0, 0, 20, 20), member('g1', 30, 0), member('g2', 60, 0), box('c', 200, 0, 20, 20)],
      'horizontal',
    );
    // Units: a (center 10), G spanning 30..100 (center 65), c (center 210). G's center goes to 110.
    expect(patches.g1!.x).toBe(75);
    expect(patches.g2!.x).toBe(105);
  });

  it('leaves locked elements out entirely', () => {
    const locked = { ...box('l', 0, 0), locked: true } as CanvasElement;
    const patches = align([locked, box('b', 100, 0), box('c', 50, 40)], 'left');
    expect(patches.l).toBeUndefined();
    expect(patches.b!.x).toBe(50);
  });

  it('aligns subgroups as units when the selection is inside a group', () => {
    const deep = (id: string, x: number, sub: string): CanvasElement =>
      ({ ...box(id, x, 0), groupPath: ['O', sub], groupId: 'O' }) as CanvasElement;
    const patches = align([deep('a1', 100, 'A'), deep('a2', 300, 'A'), deep('b1', 50, 'B'), deep('b2', 60, 'B')], 'left');
    expect(patches.a1!.x).toBe(50);
    expect(patches.a2!.x).toBe(250);
    expect(patches.b1!.x).toBe(50);
  });
});
