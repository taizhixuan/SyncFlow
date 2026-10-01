import type { CanvasElement } from '@syncflow/shared';
import { getBounds, type Rect } from './element';

type Elements = Readonly<Record<string, CanvasElement>>;

/**
 * Grow a selection so every group it touches is selected whole. A group moves
 * and styles as a unit, so selecting half of one (with a marquee, say) would let
 * a drag tear it apart. Order is kept; added members follow their group's first hit.
 */
export function expandToGroups(ids: readonly string[], elements: Elements): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const done = new Set<string>();
  const all = Object.values(elements);
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
    const g = elements[id]?.groupId;
    if (!g || done.has(g)) continue;
    done.add(g);
    for (const el of all) {
      if (el.groupId === g && !seen.has(el.id)) {
        seen.add(el.id);
        out.push(el.id);
      }
    }
  }
  return out;
}

export interface SelectedGroup {
  groupId: string;
  bounds: Rect;
  size: number;
}

/** The groups present in a selection, each with the union of its members' bounds. */
export function selectedGroups(ids: readonly string[], elements: Elements): SelectedGroup[] {
  const byGroup = new Map<string, Rect>();
  const sizes = new Map<string, number>();
  for (const id of ids) {
    const el = elements[id];
    if (!el?.groupId) continue;
    const b = getBounds(el);
    const prev = byGroup.get(el.groupId);
    byGroup.set(
      el.groupId,
      prev
        ? (() => {
            const x = Math.min(prev.x, b.x);
            const y = Math.min(prev.y, b.y);
            return {
              x,
              y,
              width: Math.max(prev.x + prev.width, b.x + b.width) - x,
              height: Math.max(prev.y + prev.height, b.y + b.height) - y,
            };
          })()
        : b,
    );
    sizes.set(el.groupId, (sizes.get(el.groupId) ?? 0) + 1);
  }
  return [...byGroup].map(([groupId, bounds]) => ({ groupId, bounds, size: sizes.get(groupId) ?? 0 }));
}

export interface GroupState {
  /** Two or more elements that are not already exactly one group. */
  canGroup: boolean;
  /** At least one selected element belongs to a group. */
  canUngroup: boolean;
  /** The selection is exactly one whole group. */
  isSingleGroup: boolean;
}

export function groupState(ids: readonly string[], elements: Elements): GroupState {
  const els = ids.map((id) => elements[id]).filter((e): e is CanvasElement => !!e);
  const groupIds = new Set(els.map((e) => e.groupId));
  const isSingleGroup = els.length >= 2 && groupIds.size === 1 && !groupIds.has(undefined);
  return {
    canGroup: els.length >= 2 && !isSingleGroup,
    canUngroup: els.some((e) => !!e.groupId),
    isSingleGroup,
  };
}
