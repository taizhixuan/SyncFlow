import type { CanvasElement, CanvasElementPatch } from '@syncflow/shared';

export interface Doc {
  elements: Record<string, CanvasElement>;
}

export function emptyDoc(): Doc {
  return { elements: {} };
}

export interface Command {
  apply(doc: Doc): Doc;
  invert(doc: Doc): Command;
}

export function addElements(els: CanvasElement[]): Command {
  return {
    apply(doc) {
      const elements = { ...doc.elements };
      for (const el of els) elements[el.id] = el;
      return { elements };
    },
    invert() {
      return removeElements(els.map((e) => e.id));
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
    invert(doc) {
      const restored = ids.map((id) => doc.elements[id]).filter((e): e is CanvasElement => !!e);
      return addElements(restored);
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
    invert(doc) {
      const prior: Record<string, CanvasElementPatch> = {};
      for (const [id, patch] of Object.entries(patches)) {
        const existing = doc.elements[id];
        if (!existing) continue;
        const before: CanvasElementPatch = {};
        for (const key of Object.keys(patch)) {
          (before as Record<string, unknown>)[key] = (existing as Record<string, unknown>)[key];
        }
        prior[id] = before;
      }
      return updateElements(prior);
    },
  };
}
