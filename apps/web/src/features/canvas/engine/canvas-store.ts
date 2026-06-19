import { createStore } from 'zustand/vanilla';
import type { CanvasElementPatch } from '@syncflow/shared';
import type { ActiveStyle } from '../model/element';
import type { Theme } from '../model/colors';
import { addElements, emptyDoc, updateElements, type Command, type Doc } from '../model/commands';
import { align, distribute, type AlignAxis, type DistributeAxis } from '../model/align';
import { History } from './history';
import { loadBoard, saveBoard } from './persistence';
import type { View } from './viewport';

export type ToolId =
  | 'select'
  | 'pan'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'freehand'
  | 'sticky'
  | 'text';

export interface CanvasState {
  doc: Doc;
  selected: string[];
  view: View;
  tool: ToolId;
  theme: Theme;
  activeStyle: ActiveStyle;
  gridEnabled: boolean;
  dispatch(cmd: Command): void;
  /** Apply a command WITHOUT recording history — used for live drag previews. */
  applyTransient(cmd: Command): void;
  undo(): void;
  redo(): void;
  setSelected(ids: string[]): void;
  setView(view: View): void;
  setTool(tool: ToolId): void;
  toggleTheme(): void;
  setActiveStyle(patch: Partial<ActiveStyle>): void;
  recolorSelection(patch: CanvasElementPatch): void;
  duplicate(ids: string[]): void;
  bringToFront(ids: string[]): void;
  sendToBack(ids: string[]): void;
  setLocked(ids: string[], locked: boolean): void;
  toggleGrid(): void;
  alignSelection(axis: AlignAxis): void;
  distributeSelection(axis: DistributeAxis): void;
  selectElement(id: string, additive: boolean): void;
  group(ids: string[]): void;
  ungroup(ids: string[]): void;
}

const DEFAULT_STYLE: ActiveStyle = {
  stroke: 'auto',
  fill: null,
  strokeWidth: 2,
  strokeStyle: 'solid',
  fontSize: 20,
};

function initialTheme(saved: Theme | undefined): Theme {
  if (saved) return saved;
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

export function createCanvasStore(boardId: string) {
  const history = new History();
  const saved = loadBoard(boardId);

  return createStore<CanvasState>((set, get) => {
    const persist = (): void => saveBoard(boardId, get().doc, get().theme);
    return {
      doc: saved?.doc ?? emptyDoc(),
      selected: [],
      view: { x: 0, y: 0, scale: 1 },
      tool: 'select',
      theme: initialTheme(saved?.theme),
      activeStyle: DEFAULT_STYLE,
      gridEnabled: false,

      dispatch(cmd) {
        set({ doc: history.push(get().doc, cmd) });
        persist();
      },
      applyTransient(cmd) {
        set({ doc: cmd.apply(get().doc) });
      },
      undo() {
        set({ doc: history.undo(get().doc) });
        persist();
      },
      redo() {
        set({ doc: history.redo(get().doc) });
        persist();
      },
      setSelected(ids) {
        set({ selected: ids });
      },
      setView(view) {
        set({ view });
      },
      setTool(tool) {
        set({ tool });
      },
      toggleTheme() {
        set({ theme: get().theme === 'light' ? 'dark' : 'light' });
        persist();
      },
      setActiveStyle(patch) {
        set({ activeStyle: { ...get().activeStyle, ...patch } });
      },
      recolorSelection(patch) {
        const ids = get().selected;
        if (ids.length === 0) return;
        const patches: Record<string, CanvasElementPatch> = {};
        for (const id of ids) patches[id] = patch;
        get().dispatch(updateElements(patches));
      },
      duplicate(ids) {
        const src = ids.map((id) => get().doc.elements[id]).filter((e) => !!e);
        if (src.length === 0) return;
        const copies = src.map((el) => ({ ...el!, id: crypto.randomUUID(), x: el!.x + 16, y: el!.y + 16 }));
        get().dispatch(addElements(copies));
        set({ selected: copies.map((c) => c.id) });
      },
      bringToFront(ids) {
        const zs = Object.values(get().doc.elements).map((e) => e.zIndex);
        let max = zs.length ? Math.max(...zs) : 0;
        const patches: Record<string, CanvasElementPatch> = {};
        for (const id of ids) patches[id] = { zIndex: ++max };
        get().dispatch(updateElements(patches));
      },
      sendToBack(ids) {
        const zs = Object.values(get().doc.elements).map((e) => e.zIndex);
        let min = zs.length ? Math.min(...zs) : 0;
        const patches: Record<string, CanvasElementPatch> = {};
        for (const id of ids) patches[id] = { zIndex: --min };
        get().dispatch(updateElements(patches));
      },
      setLocked(ids, locked) {
        const patches: Record<string, CanvasElementPatch> = {};
        for (const id of ids) patches[id] = { locked };
        get().dispatch(updateElements(patches));
      },
      toggleGrid() {
        set({ gridEnabled: !get().gridEnabled });
      },
      alignSelection(axis) {
        const els = get()
          .selected.map((id) => get().doc.elements[id])
          .filter((e) => !!e);
        if (els.length < 2) return;
        const patches = align(els, axis);
        if (Object.keys(patches).length) get().dispatch(updateElements(patches));
      },
      distributeSelection(axis) {
        const els = get()
          .selected.map((id) => get().doc.elements[id])
          .filter((e) => !!e);
        if (els.length < 3) return;
        const patches = distribute(els, axis);
        if (Object.keys(patches).length) get().dispatch(updateElements(patches));
      },
      selectElement(id, additive) {
        const el = get().doc.elements[id];
        let ids = [id];
        if (el?.groupId) {
          ids = Object.values(get().doc.elements)
            .filter((e) => e.groupId === el.groupId)
            .map((e) => e.id);
        }
        set({ selected: additive ? Array.from(new Set([...get().selected, ...ids])) : ids });
      },
      group(ids) {
        if (ids.length < 2) return;
        const groupId = crypto.randomUUID();
        const patches: Record<string, CanvasElementPatch> = {};
        for (const id of ids) patches[id] = { groupId };
        get().dispatch(updateElements(patches));
      },
      ungroup(ids) {
        const groupIds = new Set(
          ids.map((id) => get().doc.elements[id]?.groupId).filter((g): g is string => !!g),
        );
        if (groupIds.size === 0) return;
        const patches: Record<string, CanvasElementPatch> = {};
        for (const el of Object.values(get().doc.elements)) {
          if (el.groupId && groupIds.has(el.groupId)) patches[el.id] = { groupId: undefined };
        }
        get().dispatch(updateElements(patches));
      },
    };
  });
}

export type CanvasStore = ReturnType<typeof createCanvasStore>;
