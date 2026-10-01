import type { CanvasElement, CanvasElementPatch } from '@syncflow/shared';
import { getBounds, type Rect } from './element';

/**
 * Nested groups. Each element carries its group ancestry as `groupPath`,
 * outermost group first; `groupId` mirrors `groupPath[0]` so clients that only
 * know flat groups still treat the outer group as one unit. An element with
 * just a legacy `groupId` reads as the path `[groupId]`.
 *
 * The "level" of a selection is the group ancestry every selected element
 * shares (their common path prefix): grouping inserts the new group there, and
 * its units are the direct children at that level.
 */

type Elements = Readonly<Record<string, CanvasElement>>;

/** Deepest supported nesting; matches the schema's cap. */
export const MAX_GROUP_DEPTH = 16;

export function groupPath(el: CanvasElement | undefined): string[] {
  if (!el) return [];
  if (el.groupPath && el.groupPath.length) return el.groupPath;
  return el.groupId ? [el.groupId] : [];
}

/** The patch that sets an element's ancestry, keeping `groupId` in step. */
export function pathPatch(path: readonly string[]): CanvasElementPatch {
  return path.length ? { groupPath: [...path], groupId: path[0] } : { groupPath: undefined, groupId: undefined };
}

function commonPrefix(paths: readonly (readonly string[])[]): string[] {
  if (paths.length === 0) return [];
  const out: string[] = [];
  for (let i = 0; ; i++) {
    const g = paths[0]![i];
    if (g === undefined || !paths.every((p) => p[i] === g)) return out;
    out.push(g);
  }
}

/** Every element anywhere inside group `g`, nested members included. */
export function membersOf(g: string, elements: Elements): string[] {
  return Object.values(elements)
    .filter((el) => groupPath(el).includes(g))
    .map((el) => el.id);
}

function present(ids: readonly string[], elements: Elements): CanvasElement[] {
  return ids.map((id) => elements[id]).filter((e): e is CanvasElement => !!e);
}

/** The shared ancestry of a selection and the unit each element belongs to at that level. */
function level(els: readonly CanvasElement[]): { prefix: string[]; unitOf: (el: CanvasElement) => string } {
  const prefix = commonPrefix(els.map(groupPath));
  return { prefix, unitOf: (el) => groupPath(el)[prefix.length] ?? `el:${el.id}` };
}

/**
 * Grow a selection so every outermost group it touches is selected whole. A
 * group moves as a unit, so a marquee that clips part of one must not let a
 * drag tear it apart. Order is kept; added members follow their group's first hit.
 */
export function expandToGroups(ids: readonly string[], elements: Elements): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const done = new Set<string>();
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
    const g = groupPath(elements[id])[0];
    if (!g || done.has(g)) continue;
    done.add(g);
    for (const m of membersOf(g, elements)) {
      if (!seen.has(m)) {
        seen.add(m);
        out.push(m);
      }
    }
  }
  return out;
}

/**
 * What a click on `id` selects. Starting from the outermost group, it drills
 * one level deeper for as long as the current selection already lies inside
 * that group, so a first click picks the whole group, the next picks the
 * subgroup (or element) under the pointer, and so on. `deep` jumps straight to
 * the element.
 */
export function selectionForClick(
  id: string,
  selected: readonly string[],
  elements: Elements,
  deep = false,
): string[] {
  const path = groupPath(elements[id]);
  if (deep || path.length === 0) return [id];
  const sel = present(selected, elements);
  let depth = 0;
  while (depth < path.length && sel.length > 0 && sel.every((el) => groupPath(el).includes(path[depth]!))) depth++;
  return depth < path.length ? membersOf(path[depth]!, elements) : [id];
}

/**
 * Patches that wrap the selection in a new group at the selection's level.
 * Units at that level are taken whole, so the tree stays consistent. Null when
 * there are fewer than two units or the result would nest too deep.
 */
export function groupPatches(
  ids: readonly string[],
  elements: Elements,
  newId: string,
): { patches: Record<string, CanvasElementPatch>; ids: string[] } | null {
  const els = present(ids, elements);
  const { prefix, unitOf } = level(els);
  const units = new Set(els.map(unitOf));
  // Fewer than two units, or exactly one whole group: nothing to wrap.
  if (units.size < 2) return null;
  const selectedSet = new Set(els.map((e) => e.id));
  const last = prefix[prefix.length - 1];
  if (last && membersOf(last, elements).every((m) => selectedSet.has(m))) return null;
  const memberIds = new Set<string>();
  for (const u of units) {
    if (u.startsWith('el:')) memberIds.add(u.slice(3));
    else for (const m of membersOf(u, elements)) memberIds.add(m);
  }
  const patches: Record<string, CanvasElementPatch> = {};
  for (const mid of memberIds) {
    const path = groupPath(elements[mid]);
    if (path.length + 1 > MAX_GROUP_DEPTH) return null;
    patches[mid] = pathPatch([...prefix, newId, ...path.slice(prefix.length)]);
  }
  return { patches, ids: [...memberIds] };
}

/**
 * Patches that remove one level of grouping. When the selection is a whole
 * group, that group dissolves (its subgroups survive one level up); otherwise
 * each group that is a unit of the selection dissolves, and failing that the
 * innermost group the selection sits in.
 */
export function ungroupPatches(
  ids: readonly string[],
  elements: Elements,
): Record<string, CanvasElementPatch> | null {
  const els = present(ids, elements);
  const { prefix, unitOf } = level(els);
  const selectedSet = new Set(els.map((e) => e.id));
  const whole = [...prefix].reverse().find((g) => membersOf(g, elements).every((m) => selectedSet.has(m)));
  const unitGroups = [...new Set(els.map(unitOf))].filter((u) => !u.startsWith('el:'));
  // Part of a group selected (e.g. one member Ctrl/Cmd-clicked): dissolve the
  // innermost group it is in, as flat ungroup always did.
  const innermost = prefix[prefix.length - 1];
  const targets = whole ? [whole] : unitGroups.length ? unitGroups : innermost ? [innermost] : [];
  if (targets.length === 0) return null;
  const patches: Record<string, CanvasElementPatch> = {};
  for (const g of targets) {
    for (const mid of membersOf(g, elements)) {
      const path = (patches[mid]?.groupPath as string[] | undefined) ?? groupPath(elements[mid]);
      patches[mid] = pathPatch(path.filter((x) => x !== g));
    }
  }
  return patches;
}

export interface SelectedGroup {
  groupId: string;
  bounds: Rect;
  size: number;
  /** How many groups enclose this one (0 = top level). */
  depth: number;
  /** True for the group the selection sits inside, drawn as faint context. */
  context: boolean;
}

function unionBounds(ids: readonly string[], elements: Elements): Rect | null {
  let r: Rect | null = null;
  for (const id of ids) {
    const el = elements[id];
    if (!el) continue;
    const b = getBounds(el);
    if (!r) r = b;
    else {
      const x = Math.min(r.x, b.x);
      const y = Math.min(r.y, b.y);
      r = {
        x,
        y,
        width: Math.max(r.x + r.width, b.x + b.width) - x,
        height: Math.max(r.y + r.height, b.y + b.height) - y,
      };
    }
  }
  return r;
}

/**
 * Groups to outline for a selection: each group that is selected whole at the
 * selection's level, plus (as faint context) the group the selection is inside
 * when the user has drilled into one.
 */
export function selectedGroups(ids: readonly string[], elements: Elements): SelectedGroup[] {
  const els = present(ids, elements);
  if (els.length === 0) return [];
  const { prefix, unitOf } = level(els);
  const selectedSet = new Set(els.map((e) => e.id));
  const isWhole = (g: string): boolean => membersOf(g, elements).every((m) => selectedSet.has(m));
  const out: SelectedGroup[] = [];
  const push = (g: string, depth: number, context: boolean): void => {
    const members = membersOf(g, elements);
    const bounds = unionBounds(members, elements);
    if (bounds) out.push({ groupId: g, bounds, size: members.length, depth, context });
  };
  const wholeIdx = [...prefix.keys()].reverse().find((i) => isWhole(prefix[i]!));
  if (wholeIdx !== undefined) {
    push(prefix[wholeIdx]!, wholeIdx, false);
    if (wholeIdx > 0) push(prefix[wholeIdx - 1]!, wholeIdx - 1, true);
    return out;
  }
  if (prefix.length) push(prefix[prefix.length - 1]!, prefix.length - 1, true);
  for (const u of new Set(els.map(unitOf))) {
    if (!u.startsWith('el:') && isWhole(u)) push(u, prefix.length, false);
  }
  return out;
}

export interface GroupState {
  /** Two or more units at the selection's level. */
  canGroup: boolean;
  /** Something in the selection is grouped and can lose a level. */
  canUngroup: boolean;
  /** The selection is exactly one whole group. */
  isSingleGroup: boolean;
  /** Nesting depth of that group (0 = top level), when isSingleGroup. */
  depth: number;
  /** Direct children of that group (subgroups count as one), when isSingleGroup. */
  childCount: number;
}

export function groupState(ids: readonly string[], elements: Elements): GroupState {
  const els = present(ids, elements);
  const { prefix, unitOf } = level(els);
  const selectedSet = new Set(els.map((e) => e.id));
  const units = new Set(els.map(unitOf));
  const whole =
    prefix.length > 0 && membersOf(prefix[prefix.length - 1]!, elements).every((m) => selectedSet.has(m));
  return {
    canGroup: units.size >= 2 && !whole,
    canUngroup: els.some((e) => groupPath(e).length > 0) && ungroupPatches(ids, elements) !== null,
    isSingleGroup: whole,
    depth: whole ? prefix.length - 1 : 0,
    childCount: whole ? units.size : 0,
  };
}
