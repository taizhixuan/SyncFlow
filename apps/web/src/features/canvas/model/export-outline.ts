import type { CanvasElement } from '@syncflow/shared';
import { buildForest, type MindTree } from './mindmap';

function walk(tree: MindTree, nodeMap: Map<string, CanvasElement>, depth: number): string {
  const el = nodeMap.get(tree.id);
  const text = el?.text ?? '';
  const indent = '  '.repeat(depth);
  const line = `${indent}- ${text}`;
  const childLines = tree.children.map((c) => walk(c, nodeMap, depth + 1));
  return [line, ...childLines].join('\n');
}

/**
 * Serialises all mindnodes in `els` into a Markdown-style indented outline.
 * Collapsed nodes are included (the outline is structural, not a view of what's
 * visible on the canvas).
 * Returns an empty string if there are no mindnodes.
 */
export function mindMapToOutline(els: CanvasElement[]): string {
  const mindNodes = els.filter((e) => e.type === 'mindnode');
  if (mindNodes.length === 0) return '';

  // Build forest from ALL mindnodes (do not filter by collapsed first)
  const forest = buildForest(mindNodes);
  const nodeMap = new Map<string, CanvasElement>(mindNodes.map((n) => [n.id, n]));

  return forest.map((root) => walk(root, nodeMap, 0)).join('\n');
}
