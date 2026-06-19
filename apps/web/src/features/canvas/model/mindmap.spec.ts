import { describe, expect, it } from 'vitest';
import type { CanvasElement } from '@syncflow/shared';
import { buildForest, descendantIds, layoutMindMap } from './mindmap';

function makeNode(
  overrides: Partial<CanvasElement> & { id: string },
): CanvasElement {
  return {
    type: 'mindnode',
    x: 0,
    y: 0,
    rotation: 0,
    opacity: 1,
    zIndex: 0,
    fill: null,
    stroke: '#6366F1',
    strokeWidth: 1.5,
    strokeStyle: 'solid',
    width: 140,
    height: 44,
    text: 'Idea',
    fontSize: 14,
    ...overrides,
  };
}

const H_GAP = 200;
const V_GAP = 64;

describe('buildForest', () => {
  it('returns a single root for a lone node', () => {
    const nodes = [makeNode({ id: 'a' })];
    const forest = buildForest(nodes);
    expect(forest).toHaveLength(1);
    expect(forest[0]!.id).toBe('a');
    expect(forest[0]!.children).toHaveLength(0);
  });

  it('builds a parent-child tree', () => {
    const nodes = [makeNode({ id: 'a' }), makeNode({ id: 'b', parentId: 'a' })];
    const forest = buildForest(nodes);
    expect(forest).toHaveLength(1);
    expect(forest[0]!.children[0]!.id).toBe('b');
  });

  it('returns two roots for two unrelated nodes', () => {
    const nodes = [makeNode({ id: 'a' }), makeNode({ id: 'b' })];
    const forest = buildForest(nodes);
    expect(forest).toHaveLength(2);
  });
});

describe('descendantIds', () => {
  it('returns empty for a leaf node', () => {
    const nodes = [makeNode({ id: 'a' })];
    expect(descendantIds('a', nodes)).toEqual([]);
  });

  it('returns direct children', () => {
    const nodes = [makeNode({ id: 'a' }), makeNode({ id: 'b', parentId: 'a' })];
    const result = descendantIds('a', nodes);
    expect(result).toContain('b');
  });

  it('returns transitive descendants (grandchildren)', () => {
    const nodes = [
      makeNode({ id: 'a' }),
      makeNode({ id: 'b', parentId: 'a' }),
      makeNode({ id: 'c', parentId: 'b' }),
    ];
    const result = descendantIds('a', nodes);
    expect(result).toContain('b');
    expect(result).toContain('c');
  });

  it('does not include the node itself', () => {
    const nodes = [makeNode({ id: 'a' }), makeNode({ id: 'b', parentId: 'a' })];
    const result = descendantIds('a', nodes);
    expect(result).not.toContain('a');
  });
});

describe('layoutMindMap', () => {
  it('positions a single node at its own x,y', () => {
    const nodes = [makeNode({ id: 'a', x: 100, y: 200 })];
    const layout = layoutMindMap(nodes);
    expect(layout['a']).toBeDefined();
    expect(layout['a']!.x).toBe(100);
    expect(layout['a']!.y).toBe(200);
  });

  it('places children at x = parent.x + H_GAP', () => {
    const nodes = [
      makeNode({ id: 'root', x: 50, y: 100 }),
      makeNode({ id: 'c1', parentId: 'root' }),
      makeNode({ id: 'c2', parentId: 'root' }),
    ];
    const layout = layoutMindMap(nodes);
    expect(layout['c1']!.x).toBe(50 + H_GAP);
    expect(layout['c2']!.x).toBe(50 + H_GAP);
  });

  it('centers parent y between two children', () => {
    const nodes = [
      makeNode({ id: 'root', x: 0, y: 0 }),
      makeNode({ id: 'c1', parentId: 'root' }),
      makeNode({ id: 'c2', parentId: 'root' }),
    ];
    const layout = layoutMindMap(nodes);
    const c1y = layout['c1']!.y;
    const c2y = layout['c2']!.y;
    const parentY = layout['root']!.y;
    expect(parentY).toBeCloseTo((c1y + c2y) / 2);
  });

  it('assigns correct x-depths for 3 levels', () => {
    const nodes = [
      makeNode({ id: 'r', x: 0, y: 0 }),
      makeNode({ id: 'c', parentId: 'r' }),
      makeNode({ id: 'g', parentId: 'c' }),
    ];
    const layout = layoutMindMap(nodes);
    expect(layout['r']!.x).toBe(0);
    expect(layout['c']!.x).toBe(H_GAP);
    expect(layout['g']!.x).toBe(2 * H_GAP);
  });

  it('omits descendants of a collapsed node', () => {
    const nodes = [
      makeNode({ id: 'r', x: 0, y: 0 }),
      makeNode({ id: 'c', parentId: 'r', collapsed: true }),
      makeNode({ id: 'g', parentId: 'c' }),
    ];
    const layout = layoutMindMap(nodes);
    expect(layout['r']).toBeDefined();
    expect(layout['c']).toBeDefined();
    expect(layout['g']).toBeUndefined();
  });

  it('ensures two roots do not overlap (y gap >= V_GAP)', () => {
    const nodes = [
      makeNode({ id: 'r1', x: 0, y: 0 }),
      makeNode({ id: 'r2', x: 0, y: 0 }),
    ];
    const layout = layoutMindMap(nodes);
    const diff = Math.abs(layout['r1']!.y - layout['r2']!.y);
    expect(diff).toBeGreaterThanOrEqual(V_GAP);
  });
});
