import { useEffect } from 'react';
import type { CanvasElement } from '@syncflow/shared';
import { addElements, removeElements } from '../model/commands';
import { descendantIds } from '../model/mindmap';
import type { CanvasStore, ToolId } from '../engine/canvas-store';

const SHORTCUT: Record<string, ToolId> = {
  v: 'select',
  h: 'pan',
  r: 'rect',
  o: 'ellipse',
  d: 'diamond',
  g: 'triangle',
  m: 'star',
  l: 'line',
  c: 'connector',
  p: 'freehand',
  s: 'sticky',
  t: 'text',
  k: 'code',
  n: 'mindnode',
  i: 'image',
  q: 'laser',
};
let clipboard: CanvasElement[] = [];

function typing(): boolean {
  const el = document.activeElement;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable);
}

export interface PresentationCallbacks {
  presenting: boolean;
  onNext(): void;
  onPrev(): void;
  onExit(): void;
}

export function useCanvasKeyboard(store: CanvasStore, presentation?: PresentationCallbacks): void {
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (typing()) return;

      // Presentation mode captures arrow keys and Escape; normal shortcuts are suppressed.
      if (presentation?.presenting) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          presentation.onNext();
          return;
        }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          presentation.onPrev();
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          presentation.onExit();
          return;
        }
        return;
      }

      const s = store.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (mod && key === 'g') {
        e.preventDefault();
        if (e.shiftKey) s.ungroup(s.selected);
        else s.group(s.selected);
        return;
      }
      if (mod && key === 'c') {
        clipboard = s.selected
          .map((id) => s.doc.elements[id])
          .filter((x): x is CanvasElement => !!x);
        return;
      }
      if (mod && (key === 'v' || key === 'd')) {
        e.preventDefault();
        const source =
          key === 'd'
            ? s.selected.map((id) => s.doc.elements[id]).filter((x): x is CanvasElement => !!x)
            : clipboard;
        if (!source.length) return;
        const copies = source.map((el) => ({ ...el, id: crypto.randomUUID(), x: el.x + 16, y: el.y + 16 }));
        s.dispatch(addElements(copies));
        s.setSelected(copies.map((c) => c.id));
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (s.selected.length) {
          e.preventDefault();
          const allNodes = Object.values(s.doc.elements);
          const toDelete = new Set<string>(s.selected);
          for (const id of s.selected) {
            const el = s.doc.elements[id];
            if (el?.type === 'mindnode') {
              for (const did of descendantIds(id, allNodes)) toDelete.add(did);
            }
          }
          s.dispatch(removeElements([...toDelete]));
          s.setSelected([]);
        }
        return;
      }
      if (e.key === 'Escape') {
        s.setSelected([]);
        return;
      }
      const tool = SHORTCUT[key];
      if (tool && !mod) s.setTool(tool);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store, presentation]);
}
