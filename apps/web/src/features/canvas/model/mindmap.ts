import type { CanvasElement } from '@syncflow/shared';

export const H_GAP = 200;
export const V_GAP = 64;

export interface MindTree {
  id: string;
  children: MindTree[];
}

/**
 * Groups mindnodes into forest roots.
 * Roots = nodes whose parentId is absent or not found in the node set.
 */
export function buildForest(nodes: CanvasElement[]): MindTree[] {
  const ids = new Set(nodes.map((n) => n.id));
  const map = new Map<string, MindTree>();
  for (const n of nodes) map.set(n.id, { id: n.id, children: [] });

  const roots: MindTree[] = [];
  for (const n of nodes) {
    const tree = map.get(n.id)!;
    if (n.parentId && ids.has(n.parentId)) {
      map.get(n.parentId)!.children.push(tree);
    } else {
      roots.push(tree);
    }
  }
  return roots;
}

/**
 * Returns all transitive descendant IDs of nodeId.
 */
export function descendantIds(nodeId: string, nodes: CanvasElement[]): string[] {
  const children = nodes.filter((n) => n.parentId === nodeId).map((n) => n.id);
  const result: string[] = [...children];
  for (const childId of children) {
    result.push(...descendantIds(childId, nodes));
  }
  return result;
}

/**
 * Left-to-right tidy tree layout.
 * x = rootX + depth * H_GAP
 * y = post-order leaf slot assignment; internal nodes = avg of children y.
 * Collapsed descendants are OMITTED from the result.
 *
 * Returns Record<id, {x, y}> for all VISIBLE nodes.
 */
export function layoutMindMap(
  nodes: CanvasElement[],
  opts?: { hGap?: number; vGap?: number },
): Record<string, { x: number; y: number }> {
  const hGap = opts?.hGap ?? H_GAP;
  const vGap = opts?.vGap ?? V_GAP;

  // Build set of collapsed node IDs
  const collapsedIds = new Set(nodes.filter((n) => n.collapsed).map((n) => n.id));

  // Compute hidden IDs (descendants of any collapsed node)
  const hiddenIds = new Set<string>();
  for (const cid of collapsedIds) {
    for (const did of descendantIds(cid, nodes)) hiddenIds.add(did);
  }

  // Only visible nodes
  const visible = nodes.filter((n) => !hiddenIds.has(n.id));

  // Build forest from visible nodes only
  const forest = buildForest(visible);

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const result: Record<string, { x: number; y: number }> = {};

  // Slot counter: start at the first root's y so lone nodes stay at their own position.
  const firstRootEl = forest.length > 0 ? nodeMap.get(forest[0]!.id) : undefined;
  let slotY = firstRootEl?.y ?? 0;

  function layout(tree: MindTree, depth: number, rootX: number): number {
    const x = rootX + depth * hGap;

    if (tree.children.length === 0) {
      // Leaf: assign current slot
      const y = slotY;
      slotY += vGap;
      result[tree.id] = { x, y };
      return y;
    }

    // Internal: recurse children first (post-order)
    const childYs: number[] = [];
    for (const child of tree.children) {
      childYs.push(layout(child, depth + 1, rootX));
    }

    // y = average of children
    const y = childYs.reduce((a, b) => a + b, 0) / childYs.length;
    result[tree.id] = { x, y };
    return y;
  }

  for (const root of forest) {
    const rootEl = nodeMap.get(root.id);
    const rootX = rootEl?.x ?? 0;
    layout(root, 0, rootX);
    // After each tree, add a gap before the next root
    slotY += vGap;
  }

  return result;
}
