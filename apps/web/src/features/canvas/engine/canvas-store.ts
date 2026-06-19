import { createStore } from 'zustand/vanilla';
import type { CanvasElementPatch } from '@syncflow/shared';
import type { ActiveStyle } from '../model/element';
import type { Theme } from '../model/colors';
import { emptyDoc, updateElements, type Command, type Doc } from '../model/commands';
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
    };
  });
}

export type CanvasStore = ReturnType<typeof createCanvasStore>;
