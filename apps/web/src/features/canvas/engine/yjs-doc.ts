import * as Y from 'yjs';
import type { CanvasElement } from '@syncflow/shared';
import { type Command, type Doc, emptyDoc } from '../model/commands';

/** Local edits: tracked by UndoManager and sent to the network. */
export const LOCAL_ORIGIN = Symbol('local');
/** Remote edits: not tracked, not re-broadcast. */
export const REMOTE_ORIGIN = Symbol('remote');

export type YElements = Y.Map<Y.Map<unknown>>;

export function createYDoc(): { ydoc: Y.Doc; elements: YElements } {
  const ydoc = new Y.Doc();
  const elements = ydoc.getMap<Y.Map<unknown>>('elements');
  return { ydoc, elements };
}

export function toPlainDoc(elements: YElements): Doc {
  const doc = emptyDoc();
  elements.forEach((inner, id) => {
    doc.elements[id] = inner.toJSON() as CanvasElement;
  });
  return doc;
}

/** Write one element's fields into its inner map, touching only differences. */
function writeElement(elements: YElements, el: CanvasElement): void {
  let inner = elements.get(el.id);
  if (!inner) {
    inner = new Y.Map<unknown>();
    elements.set(el.id, inner);
  }
  const next = el as unknown as Record<string, unknown>;
  for (const key of Object.keys(next)) {
    if (inner.get(key) !== next[key]) inner.set(key, next[key]);
  }
  for (const key of Array.from(inner.keys())) {
    if (!(key in next)) inner.delete(key);
  }
}

/**
 * Translate a pure Command into Yjs writes by diffing the projected doc
 * before/after the command. Keeps commands.ts untouched and preserves
 * field-level merge (only changed fields are set).
 */
export function applyCommandToY(
  ydoc: Y.Doc,
  elements: YElements,
  cmd: Command,
  origin: unknown,
): void {
  const before = toPlainDoc(elements);
  const after = cmd.apply(before);
  ydoc.transact(() => {
    for (const id of Object.keys(before.elements)) {
      if (!(id in after.elements)) elements.delete(id);
    }
    for (const id of Object.keys(after.elements)) {
      const el = after.elements[id];
      if (!el) continue;
      if (JSON.stringify(before.elements[id]) !== JSON.stringify(el)) {
        writeElement(elements, el);
      }
    }
  }, origin);
}
