import type { CanvasElement } from '@syncflow/shared';
import { detachConnector, resolveConnector } from './connector';
import { groupPath, pathPatch } from './group';

export interface SavedComponent {
  id: string;
  name: string;
  elements: CanvasElement[];
  createdAt: number;
}

type Endpoint = CanvasElement['from'];

function shiftEnd(end: Endpoint, dx: number, dy: number): Endpoint {
  if (!end) return end;
  const next = { ...end };
  if (typeof next.x === 'number') next.x += dx;
  if (typeof next.y === 'number') next.y += dy;
  return next;
}

/**
 * Copy a set of elements with fresh ids, shifted by (dx, dy).
 *
 * References are remapped WITHIN the set: connector bindings, mind-map
 * parents, frame children and groups all point at the copies. References that
 * leave the set are cut — a connector end bound to an element that was not
 * copied becomes a fixed point where it is drawn now (plus the shift), and a
 * mind-map parent that was not copied is dropped. Copying them verbatim made
 * duplicates join the original's group and pasted arrows stay glued to the
 * originals. Votes and reactions belong to the original and are not copied.
 *
 * `all` is the element set used to resolve connector ends (usually the board).
 */
export function cloneElements(
  els: readonly CanvasElement[],
  all: Record<string, CanvasElement>,
  offset: { dx: number; dy: number },
  idGen: () => string,
): CanvasElement[] {
  const { dx, dy } = offset;
  const idMap = new Map<string, string>();
  for (const el of els) idMap.set(el.id, idGen());
  // One fresh group per original group, shared by all its copied members.
  const groupMap = new Map<string, string>();
  for (const el of els) {
    for (const g of groupPath(el)) if (!groupMap.has(g)) groupMap.set(g, idGen());
  }

  return els.map((el): CanvasElement => {
    const { votes: _votes, reactions: _reactions, ...rest } = el;
    const clone: CanvasElement = { ...rest, id: idMap.get(el.id)!, x: el.x + dx, y: el.y + dy };

    if (el.type === 'connector') {
      const resolved = resolveConnector(el, all);
      const remapEnd = (end: Endpoint, drawn: { x: number; y: number }): Endpoint => {
        if (end?.elementId !== undefined && idMap.has(end.elementId)) {
          return shiftEnd({ ...end, elementId: idMap.get(end.elementId) }, dx, dy);
        }
        if (end && end.elementId === undefined && typeof end.x === 'number' && typeof end.y === 'number') {
          return shiftEnd(end, dx, dy);
        }
        return { x: drawn.x + dx, y: drawn.y + dy };
      };
      if (el.from !== undefined) clone.from = remapEnd(el.from, resolved.from);
      if (el.to !== undefined) clone.to = remapEnd(el.to, resolved.to);
    }

    if (el.parentId !== undefined) {
      const parent = idMap.get(el.parentId);
      if (parent === undefined) delete clone.parentId;
      else clone.parentId = parent;
    }
    if (el.children !== undefined) {
      clone.children = el.children.map((cid) => idMap.get(cid)).filter((id): id is string => id !== undefined);
    }
    const path = groupPath(el);
    if (path.length) Object.assign(clone, pathPatch(path.map((g) => groupMap.get(g)!)));
    return clone;
  });
}

/**
 * Capture a selection as a reusable component.
 * Positions are normalized so the selection's top-left becomes (0,0).
 * Internal element ids are kept as-is (they serve as the intra-set reference map).
 *
 * Connector ends bound OUTSIDE the selection are pinned to where they are drawn
 * now, resolved against `board` when given — a saved component outlives the
 * board it came from, so the binding could never be honoured later anyway.
 */
export function captureComponent(
  name: string,
  selected: CanvasElement[],
  now: number,
  board?: Record<string, CanvasElement>,
): SavedComponent {
  if (selected.length === 0) {
    return { id: crypto.randomUUID(), name, elements: [], createdAt: now };
  }
  const inSet = new Set(selected.map((e) => e.id));
  const dict = board ?? Object.fromEntries(selected.map((e) => [e.id, e]));
  const external = new Set<string>();
  for (const el of selected) {
    for (const end of [el.from, el.to]) {
      if (end?.elementId !== undefined && !inSet.has(end.elementId)) external.add(end.elementId);
    }
  }
  const pinned = selected.map((el) => (el.type === 'connector' ? detachConnector(el, external, dict) : el));

  // Connectors are placed by their endpoints; their x/y (always 0) must not
  // drag the origin to the board's (0, 0).
  const xs: number[] = [];
  const ys: number[] = [];
  for (const el of pinned) {
    if (el.type !== 'connector') {
      xs.push(el.x);
      ys.push(el.y);
      continue;
    }
    for (const end of [el.from, el.to]) {
      if (end?.elementId === undefined && typeof end?.x === 'number' && typeof end.y === 'number') {
        xs.push(end.x);
        ys.push(end.y);
      }
    }
  }
  const minX = xs.length ? Math.min(...xs) : 0;
  const minY = ys.length ? Math.min(...ys) : 0;
  const elements = pinned.map((el) => {
    const moved: CanvasElement = { ...el, x: el.x - minX, y: el.y - minY };
    if (el.type === 'connector') {
      if (el.from) moved.from = shiftEnd(el.from, -minX, -minY);
      if (el.to) moved.to = shiftEnd(el.to, -minX, -minY);
      moved.x = el.x;
      moved.y = el.y;
    }
    return moved;
  });
  return { id: crypto.randomUUID(), name, elements, createdAt: now };
}

/**
 * Instantiate a component at `origin` with fresh ids (see cloneElements for
 * how references are remapped).
 */
export function instantiateComponent(
  comp: SavedComponent,
  origin: { x: number; y: number },
  idGen: () => string,
): CanvasElement[] {
  const dict = Object.fromEntries(comp.elements.map((e) => [e.id, e]));
  return cloneElements(comp.elements, dict, { dx: origin.x, dy: origin.y }, idGen);
}
