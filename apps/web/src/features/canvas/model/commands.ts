import type { CanvasElement, CanvasElementPatch } from '@syncflow/shared';

export interface Doc {
  elements: Record<string, CanvasElement>;
}

export function emptyDoc(): Doc {
  return { elements: {} };
}

export interface Command {
  apply(doc: Doc): Doc;
}

export function addElements(els: CanvasElement[]): Command {
  return {
    apply(doc) {
      const elements = { ...doc.elements };
      for (const el of els) elements[el.id] = el;
      return { elements };
    },
  };
}

export function removeElements(ids: string[]): Command {
  return {
    apply(doc) {
      const elements = { ...doc.elements };
      for (const id of ids) delete elements[id];
      return { elements };
    },
  };
}

export function updateElements(patches: Record<string, CanvasElementPatch>): Command {
  return {
    apply(doc) {
      const elements = { ...doc.elements };
      for (const [id, patch] of Object.entries(patches)) {
        const existing = elements[id];
        if (existing) elements[id] = { ...existing, ...patch };
      }
      return { elements };
    },
  };
}
