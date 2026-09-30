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
 * Returns all transitive descendant IDs of nodeId (never nodeId itself).
 *
 * Iterative with a visited set: `parentId` is peer-writable, and a cycle
 * (a → b → a) sent the old recursive walk round forever until the stack blew,
 * on Delete. The parent → children index is built once, so this is O(n)
 * rather than a full scan per node.
 */
export function descendantIds(nodeId: string, nodes: CanvasElement[]): string[] {
  const childrenOf = new Map<string, string[]>();
  for (const n of nodes) {
    if (n.parentId === undefined) continue;
    const list = childrenOf.get(n.parentId);
    if (list) list.push(n.id);
    else childrenOf.set(n.parentId, [n.id]);
  }
  const visited = new Set<string>([nodeId]);
  const result: string[] = [];
  const queue = [nodeId];
  for (let i = 0; i < queue.length; i++) {
    for (const child of childrenOf.get(queue[i]!) ?? []) {
      if (visited.has(child)) continue;
      visited.add(child);
      result.push(child);
      queue.push(child);
    }
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
