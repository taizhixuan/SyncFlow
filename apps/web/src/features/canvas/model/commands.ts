import type { CanvasElement, CanvasElementPatch } from '@syncflow/shared';
import { detachConnector } from './connector';

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

/**
 * Remove elements. Connectors that survive but were bound to a removed element
 * are pinned, in the same command, to the point they are drawn at now — so
 * they stay where the user saw them (and one undo restores both the element
 * and the binding) instead of losing their end. Pinning rather than deleting
 * the connector: an arrow can carry a label and styling the user may want to
 * re-attach, and deleting things the user did not select is surprising.
 */
export function removeElements(ids: string[]): Command {
  return {
    apply(doc) {
      const gone = new Set(ids.filter((id) => id in doc.elements));
      const elements = { ...doc.elements };
      for (const id of gone) delete elements[id];
      if (gone.size === 0) return { elements };
      for (const el of Object.values(elements)) {
        if (el.type !== 'connector') continue;
        const next = detachConnector(el, gone, doc.elements);
        if (next !== el) elements[el.id] = next;
      }
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
