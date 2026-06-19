import type { CanvasElement } from '@syncflow/shared';

export interface SavedComponent {
  id: string;
  name: string;
  elements: CanvasElement[];
  createdAt: number;
}

/**
 * Capture a selection as a reusable component.
 * Positions are normalized so the selection's top-left becomes (0,0).
 * Internal element ids are kept as-is (they serve as the intra-set reference map).
 */
export function captureComponent(
  name: string,
  selected: CanvasElement[],
  now: number,
): SavedComponent {
  if (selected.length === 0) {
    return { id: crypto.randomUUID(), name, elements: [], createdAt: now };
  }
  const minX = Math.min(...selected.map((e) => e.x));
  const minY = Math.min(...selected.map((e) => e.y));
  const elements = selected.map((el) => ({ ...el, x: el.x - minX, y: el.y - minY }));
  return { id: crypto.randomUUID(), name, elements, createdAt: now };
}

/**
 * Instantiate a component at `origin` with fresh ids.
 * All intra-selection references (connector from/to, mindnode parentId,
 * frame children, groupId) are remapped to the new ids.
 * References that point outside the captured set are cleared/dropped.
 */
export function instantiateComponent(
  comp: SavedComponent,
  origin: { x: number; y: number },
  idGen: () => string,
): CanvasElement[] {
  // old element id → new element id
  const idMap = new Map<string, string>();
  for (const el of comp.elements) {
    idMap.set(el.id, idGen());
  }

  // old groupId → new groupId (stable per group — all members share one new id)
  const groupMap = new Map<string, string>();
  for (const el of comp.elements) {
    if (el.groupId !== undefined && !groupMap.has(el.groupId)) {
      groupMap.set(el.groupId, crypto.randomUUID());
    }
  }

  return comp.elements.map((el): CanvasElement => {
    const clone: CanvasElement = {
      ...el,
      id: idMap.get(el.id)!,
      x: el.x + origin.x,
      y: el.y + origin.y,
    };

    if (clone.from?.elementId !== undefined) {
      clone.from = { ...clone.from, elementId: idMap.get(clone.from.elementId) };
    }
    if (clone.to?.elementId !== undefined) {
      clone.to = { ...clone.to, elementId: idMap.get(clone.to.elementId) };
    }

    if (clone.parentId !== undefined) {
      clone.parentId = idMap.get(clone.parentId);
    }

    if (clone.children !== undefined) {
      clone.children = clone.children
        .map((cid) => idMap.get(cid))
        .filter((id): id is string => id !== undefined);
    }

    if (clone.groupId !== undefined) {
      clone.groupId = groupMap.get(clone.groupId);
    }

    return clone;
  });
}
