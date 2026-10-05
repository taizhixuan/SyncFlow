import type { CanvasElement, CanvasElementPatch } from '@syncflow/shared';

/**
 * The board as arrows and mind-map links should see it mid-resize. While the
 * Transformer scales shapes it only touches their Konva nodes, so links drawn
 * from the model stayed on the old size until release. The preview patches
 * are overlaid for the link renderers only: the shapes themselves keep their
 * committed size, which the Transformer is still scaling.
 */
export function withLinkPreview(
  elements: Record<string, CanvasElement>,
  preview: Record<string, CanvasElementPatch> | null,
): Record<string, CanvasElement> {
  if (!preview) return elements;
  const next = { ...elements };
  for (const [id, patch] of Object.entries(preview)) {
    const el = next[id];
    if (el) next[id] = { ...el, ...patch } as CanvasElement;
  }
  return next;
}
