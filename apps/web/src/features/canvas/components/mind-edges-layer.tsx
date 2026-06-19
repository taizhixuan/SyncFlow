import { Layer, Line } from 'react-konva';
import { useStore } from 'zustand';
import type { CanvasStore } from '../engine/canvas-store';
import { resolveMindEdgeColor } from '../model/colors';
import { descendantIds } from '../model/mindmap';

/**
 * Non-interactive layer that draws a line from each mindnode to its parent.
 * Edges are DERIVED from parentId — no connector elements stored.
 * Collapsed descendants are hidden (not rendered).
 */
export function MindEdgesLayer({ store }: { store: CanvasStore }): JSX.Element {
  const doc = useStore(store, (s) => s.doc);
  const theme = useStore(store, (s) => s.theme);

  const allNodes = Object.values(doc.elements).filter((e) => e.type === 'mindnode');
  const allIds = new Set(allNodes.map((n) => n.id));

  // Compute hidden node IDs (descendants of collapsed nodes)
  const hiddenIds = new Set<string>();
  for (const node of allNodes) {
    if (node.collapsed) {
      for (const did of descendantIds(node.id, allNodes)) hiddenIds.add(did);
    }
  }

  const edgeColor = resolveMindEdgeColor(theme);

  return (
    <Layer listening={false}>
      {allNodes.map((node) => {
        if (!node.parentId || !allIds.has(node.parentId) || hiddenIds.has(node.id)) {
          return null;
        }
        const parent = doc.elements[node.parentId];
        if (!parent) return null;
        // Parent right-center anchor → child left-center anchor
        const px = parent.x + (parent.width ?? 140);
        const py = parent.y + (parent.height ?? 44) / 2;
        const cx = node.x;
        const cy = node.y + (node.height ?? 44) / 2;
        return (
          <Line
            key={node.id}
            points={[px, py, cx, cy]}
            stroke={edgeColor}
            strokeWidth={1.5}
            opacity={0.7}
            listening={false}
          />
        );
      })}
    </Layer>
  );
}
