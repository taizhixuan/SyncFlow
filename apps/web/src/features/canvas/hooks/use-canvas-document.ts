import { useCallback, useReducer, useState } from 'react';
import type { CanvasElement, CanvasElementPatch } from '@syncflow/shared';
import {
  addElement,
  bringToFront,
  emptyDocument,
  nextZIndex,
  orderedElements,
  removeElements,
  updateElement,
  type CanvasDocument,
} from '../lib/canvas-document';

type Action =
  | { type: 'add'; element: CanvasElement }
  | { type: 'update'; id: string; patch: CanvasElementPatch }
  | { type: 'remove'; ids: string[] }
  | { type: 'front'; id: string };

function reducer(doc: CanvasDocument, action: Action): CanvasDocument {
  switch (action.type) {
    case 'add':
      return addElement(doc, action.element);
    case 'update':
      return updateElement(doc, action.id, action.patch);
    case 'remove':
      return removeElements(doc, action.ids);
    case 'front':
      return bringToFront(doc, action.id);
  }
}

export function useCanvasDocument() {
  const [doc, dispatch] = useReducer(reducer, undefined, emptyDocument);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const add = useCallback((element: CanvasElement) => dispatch({ type: 'add', element }), []);
  const update = useCallback(
    (id: string, patch: CanvasElementPatch) => dispatch({ type: 'update', id, patch }),
    [],
  );
  const remove = useCallback((ids: string[]) => dispatch({ type: 'remove', ids }), []);
  const front = useCallback((id: string) => dispatch({ type: 'front', id }), []);

  return {
    elements: orderedElements(doc),
    nextZIndex: nextZIndex(doc),
    selectedId,
    setSelectedId,
    add,
    update,
    remove,
    front,
  };
}
