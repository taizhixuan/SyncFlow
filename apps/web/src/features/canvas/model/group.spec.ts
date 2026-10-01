import { describe, expect, it } from 'vitest';
import type { CanvasElement } from '@syncflow/shared';
import { expandToGroups, groupState, selectedGroups } from './group';

const el = (id: string, x: number, groupId?: string): CanvasElement =>
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
    ...(groupId ? { groupId } : {}),
  }) as CanvasElement;

const elements = Object.fromEntries(
  [el('a', 0, 'g1'), el('b', 20, 'g1'), el('c', 40, 'g1'), el('d', 60), el('e', 80, 'g2'), el('f', 100, 'g2')].map(
    (e) => [e.id, e],
  ),
);

describe('expandToGroups', () => {
  it('pulls in the rest of any group the selection touches', () => {
    expect(expandToGroups(['b', 'd'], elements)).toEqual(['b', 'a', 'c', 'd']);
  });

  it('leaves ungrouped selections and unknown ids alone', () => {
    expect(expandToGroups(['d', 'zz'], elements)).toEqual(['d', 'zz']);
  });

  it('does not duplicate members already selected', () => {
    expect(expandToGroups(['a', 'b', 'c', 'e'], elements)).toEqual(['a', 'b', 'c', 'e', 'f']);
  });
});

describe('selectedGroups', () => {
  it('returns one box per group spanning its selected members', () => {
    const groups = selectedGroups(['a', 'b', 'c', 'd'], elements);
    expect(groups).toEqual([{ groupId: 'g1', bounds: { x: 0, y: 0, width: 50, height: 10 }, size: 3 }]);
  });
});

describe('groupState', () => {
  it('offers Group for two or more loose elements', () => {
    expect(groupState(['d', 'e'], elements)).toEqual({ canGroup: true, canUngroup: true, isSingleGroup: false });
    expect(groupState(['d'], elements).canGroup).toBe(false);
  });

  it('treats exactly one whole group as already grouped', () => {
    expect(groupState(['a', 'b', 'c'], elements)).toEqual({ canGroup: false, canUngroup: true, isSingleGroup: true });
  });

  it('lets two groups be merged into one', () => {
    expect(groupState(['a', 'b', 'c', 'e', 'f'], elements).canGroup).toBe(true);
  });
});
