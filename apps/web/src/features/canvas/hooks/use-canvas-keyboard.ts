import { useEffect } from 'react';
import type { CanvasElement } from '@syncflow/shared';
import { addElements, removeElements, updateElements } from '../model/commands';
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

/** Arrow keys move the selection, or the camera when nothing is selected. */
const ARROW: Record<string, { dx: number; dy: number }> = {
  ArrowLeft: { dx: -1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 },
  ArrowUp: { dx: 0, dy: -1 },
  ArrowDown: { dx: 0, dy: 1 },
};
const NUDGE = 1;
const NUDGE_SHIFT = 10;
const PAN = 64;
const PAN_SHIFT = 256;

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
      if (mod && key === 'a') {
        // Always preventDefault, even on an empty board: without it the browser
        // falls back to selecting the page chrome around the canvas.
        e.preventDefault();
        // Same set as the "Select all" item in the empty-canvas context menu.
        s.setSelected(Object.keys(s.doc.elements));
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
      const arrow = ARROW[e.key];
      if (arrow && !mod) {
        e.preventDefault();
        if (s.selected.length) {
          const step = e.shiftKey ? NUDGE_SHIFT : NUDGE;
          const patches: Record<string, { x: number; y: number }> = {};
          for (const id of s.selected) {
            const el = s.doc.elements[id];
            if (!el || el.locked) continue;
            patches[id] = { x: el.x + arrow.dx * step, y: el.y + arrow.dy * step };
          }
          if (Object.keys(patches).length) s.dispatch(updateElements(patches));
          return;
        }
        // No selection: walk the camera. Pressing Right shows what lies to the
        // right, so the viewport origin moves the opposite way.
        const step = e.shiftKey ? PAN_SHIFT : PAN;
        s.setView({ ...s.view, x: s.view.x - arrow.dx * step, y: s.view.y - arrow.dy * step });
        return;
      }
      const tool = SHORTCUT[key];
      if (tool && !mod) s.setTool(tool);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store, presentation]);
}
