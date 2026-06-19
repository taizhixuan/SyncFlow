import type { CanvasElement, CanvasElementPatch } from '@syncflow/shared';

/** Local canvas document. Keyed by id; render order derives from zIndex. */
export interface CanvasDocument {
  elements: Record<string, CanvasElement>;
}

export function emptyDocument(): CanvasDocument {
  return { elements: {} };
}

export function orderedElements(doc: CanvasDocument): CanvasElement[] {
  return Object.values(doc.elements).sort((a, b) =>
    a.zIndex === b.zIndex ? a.id.localeCompare(b.id) : a.zIndex - b.zIndex,
  );
}

export function nextZIndex(doc: CanvasDocument): number {
  const values = Object.values(doc.elements);
  if (values.length === 0) return 0;
  return Math.max(...values.map((e) => e.zIndex)) + 1;
}

export function addElement(doc: CanvasDocument, element: CanvasElement): CanvasDocument {
  return { elements: { ...doc.elements, [element.id]: element } };
}

export function updateElement(
  doc: CanvasDocument,
  id: string,
  patch: CanvasElementPatch,
): CanvasDocument {
  const existing = doc.elements[id];
  if (!existing) return doc;
  return { elements: { ...doc.elements, [id]: { ...existing, ...patch } } };
}

export function removeElements(doc: CanvasDocument, ids: string[]): CanvasDocument {
  const remove = new Set(ids);
  const elements: Record<string, CanvasElement> = {};
  for (const [id, element] of Object.entries(doc.elements)) {
    if (!remove.has(id)) elements[id] = element;
  }
  return { elements };
}

export function bringToFront(doc: CanvasDocument, id: string): CanvasDocument {
  return updateElement(doc, id, { zIndex: nextZIndex(doc) });
}

export function sendToBack(doc: CanvasDocument, id: string): CanvasDocument {
  const values = Object.values(doc.elements);
  const min = values.length ? Math.min(...values.map((e) => e.zIndex)) : 0;
  return updateElement(doc, id, { zIndex: min - 1 });
}
