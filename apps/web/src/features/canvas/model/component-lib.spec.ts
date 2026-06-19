import { describe, expect, it } from 'vitest';
import type { CanvasElement } from '@syncflow/shared';
import { captureComponent, instantiateComponent } from './component-lib';

function makeIdGen(): () => string {
  let n = 0;
  return () => `new-${++n}`;
}

function makeEl(overrides: Partial<CanvasElement> & { id: string; type: CanvasElement['type'] }): CanvasElement {
  return {
    x: 0,
    y: 0,
    rotation: 0,
    opacity: 1,
    zIndex: 0,
    fill: null,
    stroke: '#000',
    strokeWidth: 2,
    strokeStyle: 'solid',
    ...overrides,
  };
}

// ── captureComponent ──────────────────────────────────────────────────────────

describe('captureComponent', () => {
  it('returns SavedComponent with correct name and createdAt', () => {
    const el = makeEl({ id: 'a', type: 'rect', x: 10, y: 20 });
    const comp = captureComponent('MyComp', [el], 12345);
    expect(comp.name).toBe('MyComp');
    expect(comp.createdAt).toBe(12345);
    expect(typeof comp.id).toBe('string');
  });

  it('normalizes positions so top-left becomes (0,0)', () => {
    const el1 = makeEl({ id: 'a', type: 'rect', x: 100, y: 200 });
    const el2 = makeEl({ id: 'b', type: 'rect', x: 150, y: 250 });
    const comp = captureComponent('Test', [el1, el2], 0);
    const [a, b] = comp.elements;
    expect(a?.x).toBe(0);
    expect(a?.y).toBe(0);
    expect(b?.x).toBe(50);
    expect(b?.y).toBe(50);
  });

  it('keeps internal ids unchanged', () => {
    const el = makeEl({ id: 'orig-id', type: 'sticky', x: 5, y: 5 });
    const comp = captureComponent('C', [el], 0);
    expect(comp.elements[0]?.id).toBe('orig-id');
  });

  it('returns empty elements for empty selection', () => {
    const comp = captureComponent('Empty', [], 0);
    expect(comp.elements).toHaveLength(0);
  });
});

// ── instantiateComponent ──────────────────────────────────────────────────────

describe('instantiateComponent', () => {
  it('produces fresh ids — no collision with original ids', () => {
    const el1 = makeEl({ id: 'orig-1', type: 'rect', x: 0, y: 0 });
    const el2 = makeEl({ id: 'orig-2', type: 'rect', x: 10, y: 0 });
    const comp = captureComponent('C', [el1, el2], 0);
    const instances = instantiateComponent(comp, { x: 0, y: 0 }, makeIdGen());
    const newIds = instances.map((e) => e.id);
    expect(newIds).not.toContain('orig-1');
    expect(newIds).not.toContain('orig-2');
    expect(new Set(newIds).size).toBe(newIds.length);
  });

  it('offsets positions to the given origin', () => {
    const el = makeEl({ id: 'a', type: 'rect', x: 100, y: 200 });
    // After capture: el normalizes to (0,0)
    const comp = captureComponent('C', [el], 0);
    const [inst] = instantiateComponent(comp, { x: 50, y: 75 }, makeIdGen());
    expect(inst?.x).toBe(50);
    expect(inst?.y).toBe(75);
  });

  it('offsets relative positions correctly when selection has multiple elements', () => {
    const el1 = makeEl({ id: 'a', type: 'rect', x: 100, y: 100 });
    const el2 = makeEl({ id: 'b', type: 'rect', x: 200, y: 150 });
    const comp = captureComponent('C', [el1, el2], 0);
    // After capture: el1=(0,0), el2=(100,50)
    const instances = instantiateComponent(comp, { x: 10, y: 20 }, makeIdGen());
    const [i1, i2] = instances;
    expect(i1?.x).toBe(10);
    expect(i1?.y).toBe(20);
    expect(i2?.x).toBe(110);
    expect(i2?.y).toBe(70);
  });

  it('remaps connector from.elementId and to.elementId to new ids', () => {
    const shapeA = makeEl({ id: 'shape-a', type: 'rect', x: 0, y: 0 });
    const shapeB = makeEl({ id: 'shape-b', type: 'rect', x: 100, y: 0 });
    const conn = makeEl({
      id: 'conn-1',
      type: 'connector',
      x: 0,
      y: 0,
      from: { elementId: 'shape-a' },
      to: { elementId: 'shape-b' },
    });
    const comp = captureComponent('C', [shapeA, shapeB, conn], 0);
    let n = 0;
    const idGen = () => `fresh-${++n}`;
    const instances = instantiateComponent(comp, { x: 0, y: 0 }, idGen);
    const connInst = instances.find((e) => e.type === 'connector');
    const aInst = instances.find((e) => e.id === 'fresh-1');
    const bInst = instances.find((e) => e.id === 'fresh-2');
    expect(aInst).toBeDefined();
    expect(bInst).toBeDefined();
    expect(connInst?.from?.elementId).toBe(aInst?.id);
    expect(connInst?.to?.elementId).toBe(bInst?.id);
  });

  it('clears connector from.elementId when ref is outside captured set', () => {
    const conn = makeEl({
      id: 'conn-1',
      type: 'connector',
      x: 0,
      y: 0,
      from: { elementId: 'external-id' },
      to: { elementId: 'another-external' },
    });
    const comp = captureComponent('C', [conn], 0);
    const [inst] = instantiateComponent(comp, { x: 0, y: 0 }, makeIdGen());
    expect(inst?.from?.elementId).toBeUndefined();
    expect(inst?.to?.elementId).toBeUndefined();
  });

  it('remaps mindnode parentId to new id when in set', () => {
    const root = makeEl({ id: 'root', type: 'mindnode', x: 0, y: 0 });
    const child = makeEl({ id: 'child', type: 'mindnode', x: 100, y: 0, parentId: 'root' });
    const comp = captureComponent('C', [root, child], 0);
    let n = 0;
    const idGen = () => `fresh-${++n}`;
    const instances = instantiateComponent(comp, { x: 0, y: 0 }, idGen);
    const rootInst = instances.find((e) => !e.parentId);
    const childInst = instances.find((e) => e.parentId !== undefined);
    expect(rootInst).toBeDefined();
    expect(childInst?.parentId).toBe(rootInst?.id);
  });

  it('clears mindnode parentId when external', () => {
    const child = makeEl({ id: 'child', type: 'mindnode', x: 0, y: 0, parentId: 'external-root' });
    const comp = captureComponent('C', [child], 0);
    const [inst] = instantiateComponent(comp, { x: 0, y: 0 }, makeIdGen());
    expect(inst?.parentId).toBeUndefined();
  });

  it('remaps frame.children to new ids, dropping external refs', () => {
    const child1 = makeEl({ id: 'c1', type: 'rect', x: 10, y: 10 });
    const child2 = makeEl({ id: 'c2', type: 'rect', x: 20, y: 10 });
    const frame = makeEl({ id: 'fr', type: 'frame', x: 0, y: 0, children: ['c1', 'c2', 'external-child'] });
    const comp = captureComponent('C', [frame, child1, child2], 0);
    let n = 0;
    const idGen = () => `fresh-${++n}`;
    const instances = instantiateComponent(comp, { x: 0, y: 0 }, idGen);
    const frameInst = instances.find((e) => e.type === 'frame');
    expect(frameInst?.children).toHaveLength(2); // external-child dropped
    // All remapped ids should be ids of actual instances in the set
    const instanceIds = new Set(instances.map((e) => e.id));
    for (const cid of frameInst?.children ?? []) {
      expect(instanceIds.has(cid)).toBe(true);
    }
  });

  it('remaps groupId consistently — all members share the same new groupId', () => {
    const grpId = 'group-original';
    const el1 = makeEl({ id: 'g1', type: 'rect', x: 0, y: 0, groupId: grpId });
    const el2 = makeEl({ id: 'g2', type: 'rect', x: 50, y: 0, groupId: grpId });
    const comp = captureComponent('C', [el1, el2], 0);
    const instances = instantiateComponent(comp, { x: 0, y: 0 }, makeIdGen());
    const [i1, i2] = instances;
    expect(i1?.groupId).toBeDefined();
    expect(i1?.groupId).toBe(i2?.groupId);
    expect(i1?.groupId).not.toBe(grpId);
  });

  it('groupId is deterministic under a controlled idGen (comes from idGen, not crypto.randomUUID)', () => {
    // Counter idGen: first 2 calls → element ids, 3rd call → groupId for the group.
    // With 2 elements sharing a group: idGen is called 2× for element ids, then 1× for the group id.
    const grpId = 'grp-orig';
    const el1 = makeEl({ id: 'a', type: 'rect', x: 0, y: 0, groupId: grpId });
    const el2 = makeEl({ id: 'b', type: 'rect', x: 0, y: 0, groupId: grpId });
    const comp = captureComponent('C', [el1, el2], 0);

    let n = 0;
    const idGen = () => `id-${++n}`;
    const instances = instantiateComponent(comp, { x: 0, y: 0 }, idGen);

    // element ids: id-1, id-2 (in order of comp.elements iteration)
    expect(instances[0]?.id).toBe('id-1');
    expect(instances[1]?.id).toBe('id-2');

    // group id: id-3 — deterministic, NOT a random UUID
    expect(instances[0]?.groupId).toBe('id-3');
    expect(instances[1]?.groupId).toBe('id-3'); // all members share the same new groupId

    // verify the counter stopped at 3 (exactly 3 idGen calls total)
    expect(n).toBe(3);
  });
});
