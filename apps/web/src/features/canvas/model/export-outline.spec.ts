import { describe, expect, it } from 'vitest';
import type { CanvasElement } from '@syncflow/shared';
import { mindMapToOutline } from './export-outline';

function makeNode(overrides: Partial<CanvasElement>): CanvasElement {
  return {
    id: 'node-1',
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
    text: 'Node',
    fontSize: 14,
    ...overrides,
  } as CanvasElement;
}

describe('mindMapToOutline', () => {
  it('empty array → empty string', () => {
    expect(mindMapToOutline([])).toBe('');
  });

  it('no mindnodes (only rect) → empty string', () => {
    const els: CanvasElement[] = [
      { id: 'r1', type: 'rect', x: 0, y: 0, rotation: 0, opacity: 1, zIndex: 0, fill: '#fff', stroke: '#000', strokeWidth: 1, strokeStyle: 'solid', width: 100, height: 100 } as CanvasElement,
    ];
    expect(mindMapToOutline(els)).toBe('');
  });

  it('single mindnode → contains "- Root"', () => {
    const els = [makeNode({ id: 'root', text: 'Root' })];
    expect(mindMapToOutline(els)).toContain('- Root');
  });

  it('3-level tree → correctly indented lines', () => {
    const root = makeNode({ id: 'root', text: 'Root', parentId: undefined });
    const child = makeNode({ id: 'child', text: 'Child', parentId: 'root' });
    const grandchild = makeNode({ id: 'grandchild', text: 'Grandchild', parentId: 'child' });
    const result = mindMapToOutline([root, child, grandchild]);
    const lines = result.split('\n');
    expect(lines).toContain('- Root');
    expect(lines).toContain('  - Child');
    expect(lines).toContain('    - Grandchild');
  });

  it('collapsed node still included in outline', () => {
    const root = makeNode({ id: 'root', text: 'Root', collapsed: false });
    const child = makeNode({ id: 'child', text: 'Hidden', parentId: 'root', collapsed: true });
    const grandchild = makeNode({ id: 'grandchild', text: 'DeepHidden', parentId: 'child' });
    const result = mindMapToOutline([root, child, grandchild]);
    expect(result).toContain('- Root');
    expect(result).toContain('  - Hidden');
    expect(result).toContain('    - DeepHidden');
  });
});
