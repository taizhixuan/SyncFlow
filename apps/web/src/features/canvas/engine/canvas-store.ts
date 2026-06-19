import { createStore } from 'zustand/vanilla';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import type { CanvasElementPatch, Comment } from '@syncflow/shared';
import type { ActiveStyle } from '../model/element';
import type { Theme } from '../model/colors';
import { addElements, updateElements, type Command, type Doc } from '../model/commands';
import { addVote, toggleReaction } from '../model/voting';
import { align, distribute, type AlignAxis, type DistributeAxis } from '../model/align';
import { addTag, removeTag, elementsWithTag } from '../model/tags';
import { arrangeRow } from '../model/arrange';
import { ALL_TEMPLATES, type TemplateId } from '../model/templates';
import { captureComponent, instantiateComponent, type SavedComponent } from '../model/component-lib';
import { loadComponents, saveComponents, addComponent, removeComponent } from './component-store';
import { createYDoc, toPlainDoc, applyCommandToY, LOCAL_ORIGIN, REMOTE_ORIGIN } from './yjs-doc';
import { getCommentsMap, toPlainComments, COMMENT_ORIGIN, type YComments } from './comments-doc';
import { getMetaMap, getTimer, applyStartTimer, applyPauseTimer, applyResetTimer, META_ORIGIN, type TimerState, type YMeta } from './meta-doc';
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
  | 'text'
  | 'diamond'
  | 'triangle'
  | 'star'
  | 'connector'
  | 'code'
  | 'frame'
  | 'mindnode'
  | 'laser';

export interface AddCommentInput {
  elementId?: string;
  point?: { x: number; y: number };
  body: string;
  author: { id: string; name: string };
}

export interface ReplyInput {
  body: string;
  author: { id: string; name: string };
}

export interface CanvasState {
  doc: Doc;
  ydoc: Y.Doc;
  awareness: Awareness;
  connection: 'offline' | 'connecting' | 'live';
  selected: string[];
  view: View;
  tool: ToolId;
  theme: Theme;
  activeStyle: ActiveStyle;
  gridEnabled: boolean;
  /** Comments projected from ydoc.getMap('comments'), sorted by createdAt. */
  comments: Comment[];
  /** Pinned to a specific comment id (set by clicking a pin or panel thread). */
  openCommentId: string | null;
  dispatch(cmd: Command): void;
  /** Apply a command WITHOUT recording history — used for live drag previews. */
  applyTransient(cmd: Command): void;
  applyRemote(update: Uint8Array): void;
  setConnection(state: 'offline' | 'connecting' | 'live'): void;
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
  /** Add a new comment thread. Returns the new comment id. */
  addComment(input: AddCommentInput): string;
  /** Append a reply to an existing comment thread. */
  replyToComment(commentId: string, input: ReplyInput): void;
  /** Mark a comment resolved or reopen it. */
  resolveComment(commentId: string, resolved: boolean): void;
  /** Delete a comment thread entirely. */
  deleteComment(commentId: string): void;
  setOpenCommentId(id: string | null): void;
  /** Add/remove a dot vote from the current user on an element. delta is typically +1 or -1. */
  voteElement(id: string, userId: string, delta: number): void;
  /** Toggle an emoji reaction for the current user on an element. */
  reactElement(id: string, emoji: string, userId: string): void;
  /** Whether voting mode is active (clicking elements adds a vote instead of selecting). */
  votingMode: boolean;
  toggleVotingMode(): void;
  // ── Timer (M4-Task4) ────────────────────────────────────────────────────────
  /** Timer state projected from ydoc.getMap('meta') — shared across all clients. */
  timer: TimerState;
  /** Whether the timer panel is open (local UI state). */
  timerOpen: boolean;
  /** Start or resume the timer. */
  startTimer(): void;
  /** Pause the timer, freezing remaining time. */
  pauseTimer(): void;
  /** Reset the timer. Pass newDurationMs to also change the duration. */
  resetTimer(newDurationMs?: number): void;
  /** Change the duration without touching running state. Equivalent to reset with new duration. */
  setTimerDuration(ms: number): void;
  /** Toggle the timer panel open/closed (local state). */
  toggleTimerOpen(): void;
  // ── Templates (M5-Task1) ─────────────────────────────────────────────────────
  /**
   * Build the named template and insert ALL its elements as a single undoable
   * addElements command, then select the inserted set.
   */
  insertTemplate(id: TemplateId, origin: { x: number; y: number }): void;
  // ── Component Library (M5-Task2) ─────────────────────────────────────────────
  /** Saved components list — loaded from localStorage, NOT synced to ydoc. */
  components: SavedComponent[];
  /** Save current selection as a named reusable component. No-op if nothing selected. */
  saveSelectionAsComponent(name: string): void;
  /** Instantiate comp at origin as normal elements → dispatch addElements (undoable) + select. */
  insertComponent(comp: SavedComponent, origin: { x: number; y: number }): void;
  /** Remove a saved component by id. */
  deleteComponent(id: string): void;
  // ── Tags (M4-Task3) ─────────────────────────────────────────────────────────
  /**
   * Local-only view filter: when non-null, elements WITHOUT this tag are dimmed.
   * Never written to the Yjs doc — it's ephemeral UI state like `selected`.
   */
  activeTagFilter: string | null;
  /** Overwrite the tags array for multiple element ids in one undoable command. */
  setElementTags(ids: string[], tags: string[]): void;
  /** Add a single tag to every currently-selected element (undoable). */
  addTagToSelection(tag: string): void;
  /** Remove a single tag from every currently-selected element (undoable). */
  removeTagFromSelection(tag: string): void;
  /**
   * Auto-group + arrange all elements that share `tag`:
   *  - assign them a common groupId (reuses the existing group mechanism)
   *  - rearrange them in a tidy row via arrangeRow
   * Single undoable command. No-op when fewer than 2 elements have the tag.
   */
  clusterByTag(tag: string): void;
  /** Set the active tag filter (local UI state — never persisted to doc). */
  setActiveTagFilter(tag: string | null): void;
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
  const { ydoc, elements } = createYDoc();
  const awareness = new Awareness(ydoc);
  const comments: YComments = getCommentsMap(ydoc);
  const meta: YMeta = getMetaMap(ydoc);
  const saved = loadBoard(boardId);
  // Seed the Y.Doc from any local snapshot so offline boards keep working.
  if (saved?.doc) {
    ydoc.transact(() => {
      for (const el of Object.values(saved.doc.elements)) {
        const inner = new Y.Map<unknown>();
        for (const [k, v] of Object.entries(el)) inner.set(k, v);
        elements.set(el.id, inner);
      }
    }, LOCAL_ORIGIN);
  }
  // Constructed AFTER seeding so loaded content is not undoable. captureTimeout 0
  // keeps each dispatch its own undo stop (no time-window merging).
  // NOTE: UndoManager is scoped to `elements` only — comments map is intentionally
  // excluded so comment mutations never appear in element undo/redo.
  const undoManager = new Y.UndoManager(elements, {
    trackedOrigins: new Set([LOCAL_ORIGIN]),
    captureTimeout: 0,
  });

  return createStore<CanvasState>((set, get) => {
    // transient is a live-drag overlay; the projection always re-applies it.
    let transient: Command | null = null;
    const project = (): void => {
      const base = toPlainDoc(elements);
      set({ doc: transient ? transient.apply(base) : base });
    };
    const persist = (): void => saveBoard(boardId, toPlainDoc(elements), get().theme);
    const projectComments = (): void => {
      set({ comments: toPlainComments(comments) });
    };

    // Rebuild the projection whenever Yjs changes (local OR remote).
    elements.observeDeep(() => {
      project();
      persist();
    });

    // Re-project comments whenever the comments map changes (local or remote).
    comments.observe(() => {
      projectComments();
    });

    // Re-project timer whenever the meta map changes (local or remote).
    const projectTimer = (): void => {
      set({ timer: getTimer(meta) });
    };
    meta.observe(() => {
      projectTimer();
    });

    return {
      doc: saved?.doc ?? toPlainDoc(elements),
      ydoc,
      awareness,
      connection: boardId === 'local' ? 'offline' : 'connecting',
      selected: [],
      view: { x: 0, y: 0, scale: 1 },
      tool: 'select',
      theme: initialTheme(saved?.theme),
      activeStyle: DEFAULT_STYLE,
      gridEnabled: false,
      comments: toPlainComments(comments),
      openCommentId: null,
      votingMode: false,
      activeTagFilter: null,
      timer: getTimer(meta),
      timerOpen: false,
      components: loadComponents(),

      dispatch(cmd) {
        transient = null;
        applyCommandToY(ydoc, elements, cmd, LOCAL_ORIGIN);
        // observeDeep handles projection+persist; if no Y change occurred, force one.
        project();
      },
      applyTransient(cmd) {
        transient = cmd;
        project();
      },
      applyRemote(update) {
        Y.applyUpdate(ydoc, update, REMOTE_ORIGIN);
      },
      setConnection(state) {
        set({ connection: state });
      },
      undo() {
        undoManager.undo();
        project();
      },
      redo() {
        undoManager.redo();
        project();
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

      // ── Comments ────────────────────────────────────────────────────────────
      // All mutations use COMMENT_ORIGIN:
      //  - NOT LOCAL_ORIGIN → not tracked by UndoManager (comments don't undo)
      //  - NOT REMOTE_ORIGIN → socket provider broadcasts them to peers

      addComment(input) {
        const id = crypto.randomUUID();
        const comment: import('@syncflow/shared').Comment = {
          id,
          ...(input.elementId !== undefined ? { elementId: input.elementId } : {}),
          ...(input.point !== undefined ? { point: input.point } : {}),
          authorId: input.author.id,
          authorName: input.author.name,
          body: input.body,
          resolved: false,
          createdAt: Date.now(),
          replies: [],
        };
        ydoc.transact(() => {
          comments.set(id, comment);
        }, COMMENT_ORIGIN);
        return id;
      },

      replyToComment(commentId, input) {
        const existing = comments.get(commentId);
        if (!existing) return;
        const reply: import('@syncflow/shared').CommentReply = {
          id: crypto.randomUUID(),
          authorId: input.author.id,
          authorName: input.author.name,
          body: input.body,
          createdAt: Date.now(),
        };
        ydoc.transact(() => {
          comments.set(commentId, { ...existing, replies: [...existing.replies, reply] });
        }, COMMENT_ORIGIN);
      },

      resolveComment(commentId, resolved) {
        const existing = comments.get(commentId);
        if (!existing) return;
        ydoc.transact(() => {
          comments.set(commentId, { ...existing, resolved });
        }, COMMENT_ORIGIN);
      },

      deleteComment(commentId) {
        ydoc.transact(() => {
          comments.delete(commentId);
        }, COMMENT_ORIGIN);
      },

      setOpenCommentId(id) {
        set({ openCommentId: id });
      },

      // ── Voting & Reactions ───────────────────────────────────────────────────

      voteElement(id, userId, delta) {
        const el = get().doc.elements[id];
        if (!el) return;
        const newVotes = addVote(el.votes ?? {}, userId, delta);
        get().dispatch(updateElements({ [id]: { votes: newVotes } }));
      },

      reactElement(id, emoji, userId) {
        const el = get().doc.elements[id];
        if (!el) return;
        const newReactions = toggleReaction(el.reactions ?? {}, emoji, userId);
        get().dispatch(updateElements({ [id]: { reactions: newReactions } }));
      },

      toggleVotingMode() {
        set({ votingMode: !get().votingMode });
      },

      // ── Tags (M4-Task3) ──────────────────────────────────────────────────────

      setElementTags(ids, tags) {
        if (ids.length === 0) return;
        const patches: Record<string, CanvasElementPatch> = {};
        for (const id of ids) patches[id] = { tags: [...tags] };
        get().dispatch(updateElements(patches));
      },

      addTagToSelection(tag) {
        const ids = get().selected;
        if (ids.length === 0) return;
        const patches: Record<string, CanvasElementPatch> = {};
        for (const id of ids) {
          const el = get().doc.elements[id];
          if (!el) continue;
          patches[id] = { tags: addTag(el.tags ?? [], tag) };
        }
        if (Object.keys(patches).length) get().dispatch(updateElements(patches));
      },

      removeTagFromSelection(tag) {
        const ids = get().selected;
        if (ids.length === 0) return;
        const patches: Record<string, CanvasElementPatch> = {};
        for (const id of ids) {
          const el = get().doc.elements[id];
          if (!el) continue;
          patches[id] = { tags: removeTag(el.tags ?? [], tag) };
        }
        if (Object.keys(patches).length) get().dispatch(updateElements(patches));
      },

      clusterByTag(tag) {
        const allEls = Object.values(get().doc.elements);
        const tagged = elementsWithTag(allEls, tag);
        if (tagged.length < 2) return;
        const groupId = crypto.randomUUID();
        const arrangePatch = arrangeRow(tagged);
        const patches: Record<string, CanvasElementPatch> = {};
        for (const el of tagged) {
          patches[el.id] = { groupId, ...(arrangePatch[el.id] ?? {}) };
        }
        get().dispatch(updateElements(patches));
      },

      setActiveTagFilter(tag) {
        set({ activeTagFilter: tag });
      },

      // ── Timer (M4-Task4) ──────────────────────────────────────────────────────
      // All mutations use META_ORIGIN:
      //  - NOT LOCAL_ORIGIN → not tracked by UndoManager (timer is not undoable)
      //  - NOT REMOTE_ORIGIN → socket provider broadcasts them to peers

      startTimer() {
        const next = applyStartTimer(get().timer, Date.now());
        ydoc.transact(() => {
          meta.set('timer', next);
        }, META_ORIGIN);
      },

      pauseTimer() {
        const next = applyPauseTimer(get().timer, Date.now());
        if (next === get().timer) return; // already paused, no-op
        ydoc.transact(() => {
          meta.set('timer', next);
        }, META_ORIGIN);
      },

      resetTimer(newDurationMs) {
        const next = applyResetTimer(get().timer, newDurationMs);
        ydoc.transact(() => {
          meta.set('timer', next);
        }, META_ORIGIN);
      },

      setTimerDuration(ms) {
        const next = applyResetTimer(get().timer, ms);
        ydoc.transact(() => {
          meta.set('timer', next);
        }, META_ORIGIN);
      },

      toggleTimerOpen() {
        set({ timerOpen: !get().timerOpen });
      },

      // ── Templates (M5-Task1) ─────────────────────────────────────────────────

      insertTemplate(id, origin) {
        const tmpl = ALL_TEMPLATES.find((t) => t.id === id);
        if (!tmpl) return;
        const els = tmpl.build(origin, () => crypto.randomUUID());
        get().dispatch(addElements(els));
        set({ selected: els.map((e) => e.id) });
      },

      // ── Component Library (M5-Task2) ──────────────────────────────────────────

      saveSelectionAsComponent(name) {
        const ids = get().selected;
        if (ids.length === 0) return;
        const els = ids
          .map((id) => get().doc.elements[id])
          .filter((e): e is import('@syncflow/shared').CanvasElement => !!e);
        const comp = captureComponent(name, els, Date.now());
        const next = addComponent(get().components, comp);
        saveComponents(next);
        set({ components: next });
      },

      insertComponent(comp, origin) {
        const els = instantiateComponent(comp, origin, () => crypto.randomUUID());
        get().dispatch(addElements(els));
        set({ selected: els.map((e) => e.id) });
      },

      deleteComponent(id) {
        const next = removeComponent(get().components, id);
        saveComponents(next);
        set({ components: next });
      },
    };
  });
}

export type CanvasStore = ReturnType<typeof createCanvasStore>;
