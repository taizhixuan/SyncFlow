import { createStore } from 'zustand/vanilla';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import type { CanvasElement, CanvasElementPatch, Comment } from '@syncflow/shared';
import { compareZ, stackOnTop, type ActiveStyle } from '../model/element';
import {
  prefersDark,
  readGridPreference,
  readThemePreference,
  writeGridPreference,
  writeThemePreference,
} from '@/lib/ui-preferences';
import { SURFACE, type Theme } from '../model/colors';
import { addElements, updateElements, type Command, type Doc } from '../model/commands';
import { addVote, toggleReaction } from '../model/voting';
import { align, distribute, type AlignAxis, type DistributeAxis } from '../model/align';
import { addTag, removeTag, elementsWithTag } from '../model/tags';
import { arrangeRow } from '../model/arrange';
import {
  MAX_GROUP_DEPTH,
  groupPatches,
  groupPath,
  pathPatch,
  prunedPaths,
  selectionForClick,
  ungroupPatches,
} from '../model/group';
import { ALL_TEMPLATES, type TemplateId } from '../model/templates';
import {
  captureComponent,
  cloneElements,
  instantiateComponent,
  type SavedComponent,
} from '../model/component-lib';
import { loadComponents, saveComponents, addComponent, removeComponent } from './component-store';
import { createYDoc, toPlainDoc, applyCommandToY, LOCAL_ORIGIN, REMOTE_ORIGIN } from './yjs-doc';
import {
  getCommentsMap,
  toPlainComments,
  insertComment,
  appendReply,
  setResolved,
  COMMENT_ORIGIN,
  type YComments,
} from './comments-doc';
import {
  getMetaMap,
  getTimer,
  timerRemainingMs,
  applyStartTimer,
  applyPauseTimer,
  applyResetTimer,
  META_ORIGIN,
  type TimerState,
  type YMeta,
} from './meta-doc';
import { boardKey, loadBoard, parseBoard, saveBoard } from './persistence';
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
  | 'image'
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
  /**
   * Viewer mode. The server drops every doc update from a viewer, so any local
   * write would render for this user only and silently diverge from the board.
   * While set, all doc mutations are refused and only non-editing tools apply.
   */
  readOnly: boolean;
  setReadOnly(readOnly: boolean): void;
  /**
   * Why the last write to this browser's storage failed (quota full, or site
   * data blocked), or null. The local board keeps its unsaved edit and retries
   * on the next change; the UI shows this so the failure is never silent.
   */
  saveError: string | null;
  clearSaveError(): void;
  /**
   * True while something needs EVERY element mounted — raster export renders
   * the Konva stage, and a culled node simply is not there to be drawn. The
   * stage must skip viewport culling while this is set.
   */
  cullingSuspended: boolean;
  /**
   * Hold culling off until the returned restore fn is called. Holds nest (a
   * counter), and each restore fn releases only its own hold, once.
   */
  suspendCulling(): () => void;
  dispatch(cmd: Command): void;
  /** Apply a command WITHOUT recording history — used for live drag previews. */
  applyTransient(cmd: Command): void;
  /**
   * Sizes of shapes mid-resize, for the arrows and mind-map links attached to
   * them (see model/link-preview). Never part of the doc; null when idle.
   */
  linkPreview: Record<string, CanvasElementPatch> | null;
  setLinkPreview(preview: Record<string, CanvasElementPatch> | null): void;
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
  /**
   * Select what a click on `id` should pick: its outermost group first, one
   * level deeper on each click inside the current selection's group, or the
   * element itself when `deep` (Ctrl/Cmd+click).
   */
  selectElement(id: string, additive: boolean, deep?: boolean): void;
  group(ids: string[]): void;
  ungroup(ids: string[]): void;
  /** Add a new comment thread. Returns the new comment id, or null when read-only. */
  addComment(input: AddCommentInput): string | null;
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
  /**
   * Timer state projected from ydoc.getMap('meta') — shared across all clients.
   * Its instants are on the server clock; read the countdown via timerRemainingMs().
   */
  timer: TimerState;
  /**
   * Server clock minus this client's clock, as measured by the sync provider.
   * 0 until measured (and always on the local board), i.e. plain local time.
   */
  clockOffsetMs: number;
  setClockOffset(offsetMs: number): void;
  /** Now, on the server clock. */
  serverNow(): number;
  /** Time left on the shared timer right now. */
  timerRemainingMs(): number;
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
  /**
   * Release store-owned window listeners and flush any pending snapshot.
   * Call from the owning component's effect cleanup.
   */
  dispose(): void;
}

/** Tools that never write to the doc — the only ones a viewer may hold. */
export const VIEWER_TOOLS: ReadonlySet<ToolId> = new Set<ToolId>(['select', 'pan', 'laser']);

export const BOARD_SAVE_ERROR =
  "Couldn't save this board in your browser. Its storage is full or blocked, so recent changes may be lost.";
export const COMPONENT_SAVE_ERROR =
  "Couldn't save the component library in your browser. Its storage is full or blocked.";

/**
 * Origin of a local-board reload from another tab's save. Not tracked by the
 * UndoManager (undo must not revert the other tab's work) and not persisted
 * back, which would echo the save between the tabs forever.
 */
const STORAGE_ORIGIN = Symbol('storage');

/** Trailing-debounce window for the localStorage snapshot. */
const PERSIST_DEBOUNCE_MS = 500;

const DEFAULT_STYLE: ActiveStyle = {
  stroke: 'auto',
  // New shapes get a solid, theme-following body; picking "none" clears it.
  fill: SURFACE,
  strokeWidth: 2,
  strokeStyle: 'solid',
  fontSize: 20,
};

/**
 * The user's own choice wins. A theme stored inside a board record is only a
 * fallback for boards saved before the preference existed — otherwise opening a
 * board would silently overwrite the theme chosen everywhere else in the app.
 */
function initialTheme(saved: Theme | undefined): Theme {
  return readThemePreference() ?? saved ?? (prefersDark() ? 'dark' : 'light');
}

/** The elements of `ids` that exist, bottom of the stack first. */
function stackedIn(ids: readonly string[], all: Record<string, CanvasElement>): CanvasElement[] {
  return ids
    .map((id) => all[id])
    .filter((e): e is CanvasElement => !!e)
    .sort(compareZ);
}

export function createCanvasStore(boardId: string) {
  const { ydoc, elements } = createYDoc();
  const awareness = new Awareness(ydoc);
  const comments: YComments = getCommentsMap(ydoc);
  const meta: YMeta = getMetaMap(ydoc);
  // Only the unsynced 'local' board lives in localStorage. Synced boards persist
  // through y-indexeddb + the server; replaying a JSON copy into them would
  // insert fresh Y.Maps under a new clientID — concurrent writes that can beat
  // newer server edits and resurrect elements a peer deleted.
  const snapshotsLocally = boardId === 'local';
  const saved = loadBoard(boardId);
  if (snapshotsLocally && saved?.doc) {
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
      // Handing the previous doc back to the projector lets unchanged elements
      // keep their object identity, so a one-shape edit re-renders one shape.
      const base = toPlainDoc(elements, get().doc);
      set({ doc: transient ? transient.apply(base) : base });
    };

    // Snapshotting to localStorage means stringifying the whole board and a
    // synchronous main-thread write. Firing that on every Yjs change put it in
    // the middle of drags and remote-update bursts; trailing-debounce it so a
    // burst costs one write instead of hundreds.
    let persistTimer: ReturnType<typeof setTimeout> | null = null;
    // Only a store that has changed something since it loaded may write. A
    // second store for the same board (React StrictMode builds one and throws it
    // away; a remount races the old one) still holds the board as it was when
    // it loaded, and its pagehide flush would save that over newer work.
    let dirty = false;
    // Elements this tab changed since its last successful save. Elements carry
    // no version, so a save from another tab is merged by id: these keep this
    // tab's state, everything else takes the other tab's.
    const unsavedIds = new Set<string>();
    const write = (): void => {
      if (!dirty) return;
      // A refused write (quota full, site data blocked) leaves the edit dirty,
      // so the next change or the pagehide flush tries again.
      if (saveBoard(boardId, toPlainDoc(elements), get().theme)) {
        dirty = false;
        unsavedIds.clear();
        if (get().saveError === BOARD_SAVE_ERROR) set({ saveError: null });
      } else {
        set({ saveError: BOARD_SAVE_ERROR });
      }
    };
    const persistNow = (): void => {
      if (!snapshotsLocally) return;
      if (persistTimer !== null) {
        clearTimeout(persistTimer);
        persistTimer = null;
      }
      write();
    };
    const persist = (): void => {
      if (!snapshotsLocally) return;
      dirty = true;
      if (persistTimer !== null) return; // a write is already scheduled
      persistTimer = setTimeout(() => {
        persistTimer = null;
        write();
      }, PERSIST_DEBOUNCE_MS);
    };
    // A debounced write can still be in flight when the tab goes away.
    // `pagehide` fires on close, navigation and bfcache entry alike, where
    // `beforeunload` is unreliable on mobile Safari.
    const flushOnHide = (): void => persistNow();
    // Two tabs on the local board each held a full copy and the last to save
    // wiped the other's work. Take the other tab's save as it lands, keeping
    // whatever this tab has not saved yet.
    const onStorage = (e: StorageEvent): void => {
      if (e.key !== boardKey(boardId)) return;
      const theirs = parseBoard(e.newValue);
      if (!theirs) return;
      const merge: Command = {
        apply(before) {
          const next = { ...theirs.doc.elements };
          for (const id of unsavedIds) {
            const mine = before.elements[id];
            if (mine) next[id] = mine;
            else delete next[id];
          }
          return { elements: next };
        },
      };
      applyCommandToY(ydoc, elements, merge, STORAGE_ORIGIN);
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', flushOnHide);
      if (snapshotsLocally) window.addEventListener('storage', onStorage);
    }
    const projectComments = (): void => {
      set({ comments: toPlainComments(comments) });
    };

    // Rebuild the projection whenever Yjs changes (local OR remote).
    elements.observeDeep((events, txn) => {
      project();
      if (txn.origin === STORAGE_ORIGIN) return; // already saved, by the other tab
      if (snapshotsLocally) {
        for (const ev of events) {
          if (ev.target === elements) for (const id of ev.changes.keys.keys()) unsavedIds.add(id);
          else if (typeof ev.path[0] === 'string') unsavedIds.add(ev.path[0]);
        }
      }
      persist();
    });

    // Re-project comments whenever the comments map changes (local or remote).
    // Deep: replies and resolve flags live inside each thread's own Y.Map.
    comments.observeDeep(() => {
      projectComments();
    });

    // Re-project timer whenever the meta map changes (local or remote). It is
    // projected verbatim: its instants are server time and are only turned
    // into a countdown against serverNow().
    const projectTimer = (): void => {
      set({ timer: getTimer(meta) });
    };
    meta.observe(() => {
      projectTimer();
    });

    let cullingHolds = 0;

    return {
      // Project from Yjs, the authority — for 'local' it was seeded above.
      doc: toPlainDoc(elements),
      ydoc,
      awareness,
      connection: boardId === 'local' ? 'offline' : 'connecting',
      selected: [],
      view: { x: 0, y: 0, scale: 1 },
      tool: 'select',
      theme: initialTheme(saved?.theme),
      activeStyle: DEFAULT_STYLE,
      gridEnabled: readGridPreference(),
      comments: toPlainComments(comments),
      openCommentId: null,
      votingMode: false,
      readOnly: false,
      saveError: null,
      linkPreview: null,
      cullingSuspended: false,
      activeTagFilter: null,
      timer: getTimer(meta),
      clockOffsetMs: 0,
      timerOpen: false,
      components: loadComponents(),

      setReadOnly(readOnly) {
        if (!readOnly) {
          set({ readOnly });
          return;
        }
        transient = null;
        const { tool } = get();
        set({ readOnly, votingMode: false, tool: VIEWER_TOOLS.has(tool) ? tool : 'select' });
        project();
      },

      clearSaveError() {
        set({ saveError: null });
      },

      suspendCulling() {
        cullingHolds += 1;
        if (cullingHolds === 1) set({ cullingSuspended: true });
        let released = false;
        return () => {
          if (released) return;
          released = true;
          cullingHolds -= 1;
          if (cullingHolds === 0) set({ cullingSuspended: false });
        };
      },

      dispatch(cmd) {
        if (get().readOnly) return;
        transient = null;
        applyCommandToY(ydoc, elements, cmd, LOCAL_ORIGIN);
        // observeDeep handles projection+persist; if no Y change occurred, force one.
        project();
      },
      setLinkPreview(preview) {
        set({ linkPreview: preview });
      },
      applyTransient(cmd) {
        if (get().readOnly) return;
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
        if (get().readOnly) return;
        undoManager.undo();
        project();
      },
      redo() {
        if (get().readOnly) return;
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
        if (get().readOnly && !VIEWER_TOOLS.has(tool)) return;
        set({ tool });
      },
      toggleTheme() {
        const theme = get().theme === 'light' ? 'dark' : 'light';
        set({ theme });
        writeThemePreference(theme);
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
        const { elements: all } = get().doc;
        const src = ids.map((id) => all[id]).filter((e): e is CanvasElement => !!e);
        if (src.length === 0) return;
        // Remap ids within the copied set so copies form their own group and
        // their connectors bind to each other, not to the originals.
        const copies = cloneElements(src, all, { dx: 16, dy: 16 }, () => crypto.randomUUID());
        get().dispatch(addElements(copies));
        set({ selected: copies.map((c) => c.id) });
      },
      // Both restack the selection in its current paint order, not the order
      // it was picked in: handing out z by selection order reversed (back) or
      // scrambled (front) the selected shapes among themselves.
      bringToFront(ids) {
        const all = get().doc.elements;
        const zs = Object.values(all).map((e) => e.zIndex);
        const max = zs.length ? Math.max(...zs) : 0;
        const patches: Record<string, CanvasElementPatch> = {};
        stackedIn(ids, all).forEach((el, i) => (patches[el.id] = { zIndex: max + 1 + i }));
        get().dispatch(updateElements(patches));
      },
      sendToBack(ids) {
        const all = get().doc.elements;
        const zs = Object.values(all).map((e) => e.zIndex);
        const min = zs.length ? Math.min(...zs) : 0;
        const sel = stackedIn(ids, all);
        const patches: Record<string, CanvasElementPatch> = {};
        sel.forEach((el, i) => (patches[el.id] = { zIndex: min - sel.length + i }));
        get().dispatch(updateElements(patches));
      },
      setLocked(ids, locked) {
        const patches: Record<string, CanvasElementPatch> = {};
        for (const id of ids) patches[id] = { locked };
        get().dispatch(updateElements(patches));
      },
      toggleGrid() {
        const gridEnabled = !get().gridEnabled;
        set({ gridEnabled });
        writeGridPreference(gridEnabled);
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
      selectElement(id, additive, deep = false) {
        const { doc, selected } = get();
        // Additive clicks always add a whole unit from the top, never drill.
        const ids = selectionForClick(id, additive ? [] : selected, doc.elements, deep);
        set({ selected: additive ? Array.from(new Set([...selected, ...ids])) : ids });
      },
      group(ids) {
        // Wraps the selection in a new group at its level (nesting when the
        // selection is inside a group); the new group stays selected.
        const res = groupPatches(ids, get().doc.elements, crypto.randomUUID());
        if (!res) return;
        get().dispatch(updateElements(res.patches));
        set({ selected: res.ids });
      },
      ungroup(ids) {
        // Removes one level: the selected group itself, or each group the
        // selection is made of. Subgroups survive one level up.
        const patches = ungroupPatches(ids, get().doc.elements);
        if (!patches) return;
        get().dispatch(updateElements(patches));
      },

      // ── Comments ────────────────────────────────────────────────────────────
      // All mutations use COMMENT_ORIGIN:
      //  - NOT LOCAL_ORIGIN → not tracked by UndoManager (comments don't undo)
      //  - NOT REMOTE_ORIGIN → socket provider broadcasts them to peers

      addComment(input) {
        if (get().readOnly) return null;
        // The projection drops threads without exactly one pin target, so
        // refuse to write one rather than create a comment nobody can see.
        if ((input.elementId === undefined) === (input.point === undefined)) return null;
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
          insertComment(comments, comment);
        }, COMMENT_ORIGIN);
        return id;
      },

      replyToComment(commentId, input) {
        if (get().readOnly) return;
        if (!comments.has(commentId)) return;
        const reply: import('@syncflow/shared').CommentReply = {
          id: crypto.randomUUID(),
          authorId: input.author.id,
          authorName: input.author.name,
          body: input.body,
          createdAt: Date.now(),
        };
        ydoc.transact(() => {
          appendReply(comments, commentId, reply);
        }, COMMENT_ORIGIN);
      },

      resolveComment(commentId, resolved) {
        if (get().readOnly) return;
        if (!comments.has(commentId)) return;
        ydoc.transact(() => {
          setResolved(comments, commentId, resolved);
        }, COMMENT_ORIGIN);
      },

      deleteComment(commentId) {
        if (get().readOnly) return;
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
        if (get().readOnly) return;
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
        const taggedIds = new Set(tagged.map((e) => e.id));
        // A tagged element keeps the subgroups that are wholly tagged (they nest
        // inside the cluster) and leaves the rest. Overwriting every path with
        // [groupId] flattened nested groups, and could strand an untagged
        // sibling as a group of one.
        const wholeCache = new Map<string, boolean>();
        const whole = (g: string): boolean => {
          let w = wholeCache.get(g);
          if (w === undefined) {
            w = allEls.every((e) => !groupPath(e).includes(g) || taggedIds.has(e.id));
            wholeCache.set(g, w);
          }
          return w;
        };
        // Too deep to nest one more level: arrange only, as group() would refuse.
        const nest = tagged.every((e) => groupPath(e).filter(whole).length < MAX_GROUP_DEPTH);
        const paths = new Map<string, string[]>();
        for (const el of allEls) {
          const path = groupPath(el);
          if (nest && taggedIds.has(el.id)) paths.set(el.id, [groupId, ...path.filter(whole)]);
          else if (path.length) paths.set(el.id, path);
        }
        const touched = nest ? [groupId, ...tagged.flatMap((e) => groupPath(e))] : [];
        const pathOf = (el: CanvasElement): string[] => paths.get(el.id) ?? [];
        for (const [id, path] of prunedPaths(allEls, touched, pathOf)) paths.set(id, path);
        const patches: Record<string, CanvasElementPatch> = {};
        for (const el of allEls) {
          const next = paths.get(el.id) ?? [];
          const pathChanged = next.join('/') !== groupPath(el).join('/');
          const move = arrangePatch[el.id];
          if (pathChanged || move) patches[el.id] = { ...(pathChanged ? pathPatch(next) : {}), ...(move ?? {}) };
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

      setClockOffset(offsetMs) {
        if (Number.isFinite(offsetMs)) set({ clockOffsetMs: offsetMs });
      },

      serverNow() {
        return Date.now() + get().clockOffsetMs;
      },

      timerRemainingMs() {
        return timerRemainingMs(get().timer, get().serverNow());
      },

      startTimer() {
        if (get().readOnly) return;
        const next = applyStartTimer(get().timer, get().serverNow());
        ydoc.transact(() => {
          meta.set('timer', next);
        }, META_ORIGIN);
      },

      pauseTimer() {
        if (get().readOnly) return;
        const next = applyPauseTimer(get().timer, get().serverNow());
        if (next === get().timer) return; // already paused, no-op
        ydoc.transact(() => {
          meta.set('timer', next);
        }, META_ORIGIN);
      },

      resetTimer(newDurationMs) {
        if (get().readOnly) return;
        const next = applyResetTimer(get().timer, newDurationMs);
        ydoc.transact(() => {
          meta.set('timer', next);
        }, META_ORIGIN);
      },

      setTimerDuration(ms) {
        if (get().readOnly) return;
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
        // Builders number z from scratch; lift the set above the board as a block.
        const els = stackOnTop(tmpl.build(origin, () => crypto.randomUUID()), get().doc.elements);
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
        const comp = captureComponent(name, els, Date.now(), get().doc.elements);
        const next = addComponent(get().components, comp);
        // Kept for this session even when the browser refuses to store it.
        set({ components: next, ...(saveComponents(next) ? {} : { saveError: COMPONENT_SAVE_ERROR }) });
      },

      insertComponent(comp, origin) {
        const els = stackOnTop(instantiateComponent(comp, origin, () => crypto.randomUUID()), get().doc.elements);
        get().dispatch(addElements(els));
        set({ selected: els.map((e) => e.id) });
      },

      deleteComponent(id) {
        const next = removeComponent(get().components, id);
        set({ components: next, ...(saveComponents(next) ? {} : { saveError: COMPONENT_SAVE_ERROR }) });
      },

      dispose() {
        if (typeof window !== 'undefined') {
          window.removeEventListener('pagehide', flushOnHide);
          window.removeEventListener('storage', onStorage);
        }
        persistNow(); // don't lose edits made inside the last debounce window
      },
    };
  });
}

export type CanvasStore = ReturnType<typeof createCanvasStore>;
