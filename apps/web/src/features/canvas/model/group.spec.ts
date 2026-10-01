import { describe, expect, it } from 'vitest';
import type { CanvasElement, CanvasElementPatch } from '@syncflow/shared';
import {
  expandToGroups,
  groupPatches,
  groupPath,
  groupState,
  selectedGroups,
  selectionForClick,
  ungroupPatches,
} from './group';

type Elements = Record<string, CanvasElement>;

const el = (id: string, x: number, path: string[] = [], legacy?: string): CanvasElement =>
  ({
    id,
    type: 'rect',
    x,
    y: 0,
    width: 10,
    height: 10,
    rotation: 0,
    opacity: 1,
    zIndex: 0,
    fill: null,
    stroke: 'auto',
    strokeWidth: 2,
    strokeStyle: 'solid',
    ...(legacy ? { groupId: legacy } : {}),
    ...(path.length ? { groupPath: path, groupId: path[0] } : {}),
  }) as CanvasElement;

const board = (...els: CanvasElement[]): Elements => Object.fromEntries(els.map((e) => [e.id, e]));

/** Apply patches the way updateElements does: an undefined value clears the key. */
function apply(elements: Elements, patches: Record<string, CanvasElementPatch>): Elements {
  const out = { ...elements };
  for (const [id, p] of Object.entries(patches)) {
    const next = { ...out[id]!, ...p } as Record<string, unknown>;
    for (const [k, v] of Object.entries(p)) if (v === undefined) delete next[k];
    out[id] = next as CanvasElement;
  }
  return out;
}

// O = outer group { I = inner group { a, b }, c }; d is loose; L { e, f } is a legacy flat group.
const nested = board(
  el('a', 0, ['O', 'I']),
  el('b', 20, ['O', 'I']),
  el('c', 40, ['O']),
  el('d', 60),
  el('e', 80, [], 'L'),
  el('f', 100, [], 'L'),
);

describe('groupPath', () => {
  it('reads legacy flat groups as a one-level path', () => {
    expect(groupPath(nested.e)).toEqual(['L']);
    expect(groupPath(nested.d)).toEqual([]);
  });
});

describe('selectionForClick', () => {
  it('first click picks the outermost group', () => {
    expect(selectionForClick('a', [], nested).sort()).toEqual(['a', 'b', 'c']);
  });

  it('each further click inside the selection drills one level', () => {
    expect(selectionForClick('a', ['a', 'b', 'c'], nested).sort()).toEqual(['a', 'b']);
    expect(selectionForClick('a', ['a', 'b'], nested)).toEqual(['a']);
  });

  it('stays at the same level when moving between siblings', () => {
    expect(selectionForClick('c', ['a', 'b'], nested)).toEqual(['c']);
  });

  it('clicking outside the current group starts from the top again', () => {
    expect(selectionForClick('e', ['a', 'b'], nested).sort()).toEqual(['e', 'f']);
  });

  it('deep select jumps straight to the element', () => {
    expect(selectionForClick('a', [], nested, true)).toEqual(['a']);
  });
});

describe('expandToGroups', () => {
  it('takes whole outermost groups, nested members included', () => {
    expect(expandToGroups(['b', 'd'], nested)).toEqual(['b', 'a', 'c', 'd']);
  });
});

describe('groupPatches', () => {
  it('wraps two top-level groups in a new outer group and keeps their insides', () => {
    const next = apply(nested, groupPatches(['a', 'b', 'c', 'e', 'f'], nested, 'N')!.patches);
    expect(groupPath(next.a)).toEqual(['N', 'O', 'I']);
    expect(groupPath(next.c)).toEqual(['N', 'O']);
    expect(groupPath(next.e)).toEqual(['N', 'L']);
    expect(next.a!.groupId).toBe('N');
  });

  it('takes whole units, so grouping a member of O with d wraps all of O', () => {
    const res = groupPatches(['c', 'd'], nested, 'N')!;
    expect(res.ids.sort()).toEqual(['a', 'b', 'c', 'd']);
    const next = apply(nested, res.patches);
    expect(groupPath(next.a)).toEqual(['N', 'O', 'I']);
    expect(groupPath(next.d)).toEqual(['N']);
  });

  it('nests the new group at the shared level when grouping siblings inside a group', () => {
    const b = board(el('x', 0, ['P']), el('y', 10, ['P']), el('z', 20, ['P']));
    const next = apply(b, groupPatches(['x', 'y'], b, 'N')!.patches);
    expect(groupPath(next.x)).toEqual(['P', 'N']);
    expect(groupPath(next.y)).toEqual(['P', 'N']);
    expect(groupPath(next.z)).toEqual(['P']);
    expect(next.x!.groupId).toBe('P');
  });

  it('refuses a single unit or exactly one whole group', () => {
    expect(groupPatches(['d'], nested, 'N')).toBeNull();
    expect(groupPatches(['a', 'b', 'c'], nested, 'N')).toBeNull();
    expect(groupPatches(['a', 'b'], nested, 'N')).toBeNull();
  });
});

describe('ungroupPatches', () => {
  it('dissolves only the selected group; its subgroups move up a level', () => {
    const next = apply(nested, ungroupPatches(['a', 'b', 'c'], nested)!);
    expect(groupPath(next.a)).toEqual(['I']);
    expect(next.a!.groupId).toBe('I');
    expect(groupPath(next.c)).toEqual([]);
    expect(next.c!.groupId).toBeUndefined();
  });

  it('dissolves an inner group selected after drilling in', () => {
    const next = apply(nested, ungroupPatches(['a', 'b'], nested)!);
    expect(groupPath(next.a)).toEqual(['O']);
    expect(groupPath(next.c)).toEqual(['O']);
  });

  it('works on legacy flat groups', () => {
    const next = apply(nested, ungroupPatches(['e', 'f'], nested)!);
    expect(groupPath(next.e)).toEqual([]);
    expect(next.e!.groupId).toBeUndefined();
  });

  it('falls back to the innermost group when only part of it is selected', () => {
    const next = apply(nested, ungroupPatches(['a'], nested)!);
    expect(groupPath(next.a)).toEqual(['O']);
    expect(groupPath(next.b)).toEqual(['O']);
  });

  it('has nothing to do for loose elements', () => {
    expect(ungroupPatches(['d'], nested)).toBeNull();
  });
});

describe('groupState and selectedGroups', () => {
  it('reports a whole group with its depth and child count', () => {
    expect(groupState(['a', 'b'], nested)).toMatchObject({ isSingleGroup: true, depth: 1, canGroup: false, canUngroup: true });
    expect(groupState(['a', 'b', 'c'], nested)).toMatchObject({ isSingleGroup: true, depth: 0, childCount: 2 });
  });

  it('outlines the selected group and, faintly, the group it sits in', () => {
    expect(selectedGroups(['a', 'b'], nested).map((g) => [g.groupId, g.context, g.depth])).toEqual([
      ['I', false, 1],
      ['O', true, 0],
    ]);
  });

  it('offers grouping for two loose units', () => {
    expect(groupState(['d', 'e', 'f'], nested)).toMatchObject({ canGroup: true, isSingleGroup: false });
  });
});
