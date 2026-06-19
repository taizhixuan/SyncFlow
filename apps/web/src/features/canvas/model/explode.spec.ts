import { beforeEach, describe, expect, it } from 'vitest';
import type { CanvasElement } from '@syncflow/shared';
import { explodeToNodes } from './explode';

let counter = 0;
const idGen = (): string => `id-${++counter}`;

function makeText(overrides: Partial<CanvasElement>): CanvasElement {
  return {
    id: 'src',
    type: 'text',
    x: 100,
    y: 200,
    rotation: 0,
    opacity: 1,
    zIndex: 1,
    fill: null,
    stroke: 'auto',
    strokeWidth: 0,
    strokeStyle: 'solid',
    width: 200,
    height: 28,
    text: '',
    fontSize: 20,
    ...overrides,
  } as CanvasElement;
}

beforeEach(() => {
  counter = 0;
});

describe('explodeToNodes', () => {
  it('returns [] for a single non-empty line', () => {
    const src = makeText({ text: 'just one line' });
    expect(explodeToNodes(src, idGen)).toEqual([]);
  });

  it('returns [] for an empty text', () => {
    const src = makeText({ text: '' });
    expect(explodeToNodes(src, idGen)).toEqual([]);
  });

  it('returns [] for only blank lines', () => {
    const src = makeText({ text: '   \n\n   ' });
    expect(explodeToNodes(src, idGen)).toEqual([]);
  });

  it('returns [] when only one non-empty line after stripping blanks', () => {
    const src = makeText({ text: '\nonly line\n\n' });
    expect(explodeToNodes(src, idGen)).toEqual([]);
  });

  it('3-line text → 1 root + 2 children', () => {
    const src = makeText({ text: 'Root\nChild one\nChild two' });
    const nodes = explodeToNodes(src, idGen);
    expect(nodes).toHaveLength(3);

    const root = nodes[0]!;
    expect(root.type).toBe('mindnode');
    expect(root.text).toBe('Root');
    expect(root.parentId).toBeUndefined();

    const c1 = nodes[1]!;
    const c2 = nodes[2]!;
    expect(c1.type).toBe('mindnode');
    expect(c1.text).toBe('Child one');
    expect(c1.parentId).toBe(root.id);

    expect(c2.type).toBe('mindnode');
    expect(c2.text).toBe('Child two');
    expect(c2.parentId).toBe(root.id);
  });

  it('root is positioned at source location', () => {
    const src = makeText({ x: 50, y: 75, text: 'Root\nChild' });
    const nodes = explodeToNodes(src, idGen);
    const root = nodes[0]!;
    expect(root.x).toBe(50);
    expect(root.y).toBe(75);
  });

  it('children are laid out (x > root.x)', () => {
    const src = makeText({ x: 0, y: 0, text: 'Root\nChild one\nChild two' });
    const nodes = explodeToNodes(src, idGen);
    const root = nodes[0]!;
    for (const n of nodes.slice(1)) {
      expect(n.x).toBeGreaterThan(root.x);
    }
  });

  it('skips blank lines — only non-empty lines become nodes', () => {
    const src = makeText({ text: 'Root\n\n  \nChild' });
    const nodes = explodeToNodes(src, idGen);
    expect(nodes).toHaveLength(2);
    expect(nodes[0]!.text).toBe('Root');
    expect(nodes[1]!.text).toBe('Child');
  });

  it('works for sticky source element type', () => {
    const src: CanvasElement = {
      id: 'sticky-src',
      type: 'sticky',
      x: 0,
      y: 0,
      rotation: 0,
      opacity: 1,
      zIndex: 1,
      fill: '#FFEFB0',
      stroke: '#E8D27A',
      strokeWidth: 1,
      strokeStyle: 'solid',
      width: 160,
      height: 120,
      text: 'Root\nChild',
      fontSize: 16,
    };
    const nodes = explodeToNodes(src, idGen);
    expect(nodes).toHaveLength(2);
    expect(nodes[0]!.type).toBe('mindnode');
  });

  it('assigns unique ids from idGen', () => {
    const src = makeText({ text: 'A\nB\nC' });
    const nodes = explodeToNodes(src, idGen);
    const ids = nodes.map((n) => n.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});
