export interface View {
  x: number;
  y: number;
  scale: number;
}

export function screenToCanvas(view: View, p: { x: number; y: number }): { x: number; y: number } {
  return { x: (p.x - view.x) / view.scale, y: (p.y - view.y) / view.scale };
}

export function zoomAtPoint(
  view: View,
  screenPoint: { x: number; y: number },
  factor: number,
  min = 0.2,
  max = 4,
): View {
  const scale = Math.min(max, Math.max(min, view.scale * factor));
  const anchor = screenToCanvas(view, screenPoint);
  return { scale, x: screenPoint.x - anchor.x * scale, y: screenPoint.y - anchor.y * scale };
}
