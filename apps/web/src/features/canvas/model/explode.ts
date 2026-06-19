import type { CanvasElement } from '@syncflow/shared';
import { createElement } from './element';
import { layoutMindMap } from './mindmap';

/**
 * Explodes a multi-line text or sticky element into a root mindnode and
 * child mindnodes (one per subsequent non-empty line). Uses layoutMindMap
 * to fan the children out tidily to the right of the root.
 *
 * Returns [] when fewer than 2 non-empty lines are present (nothing to explode).
 */
export function explodeToNodes(source: CanvasElement, idGen: () => string): CanvasElement[] {
  const lines = (source.text ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) return [];

  const rootId = idGen();
  const defaultStyle = { stroke: '#6366F1', fill: null, strokeWidth: 1.5, strokeStyle: 'solid' as const, fontSize: 14 };

  const rootBase = createElement('mindnode', { x: source.x, y: source.y }, source.zIndex, defaultStyle);
  const root: CanvasElement = { ...rootBase, id: rootId, text: lines[0]! };

  const children: CanvasElement[] = lines.slice(1).map((line) => {
    const childBase = createElement('mindnode', { x: source.x, y: source.y }, source.zIndex, defaultStyle);
    return { ...childBase, id: idGen(), text: line, parentId: rootId };
  });

  // Apply tidy layout so children fan out to the right of the root.
  const allNodes = [root, ...children];
  const layout = layoutMindMap(allNodes);

  return allNodes.map((n) => {
    const pos = layout[n.id];
    return pos ? { ...n, x: pos.x, y: pos.y } : n;
  });
}
