import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Circle, Layer, Line, Rect, Stage } from 'react-konva';
import { useStore } from 'zustand';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { Awareness } from 'y-protocols/awareness';
import type { CanvasElement } from '@syncflow/shared';
import { ElementView } from './element-view';
import { ConnectorView } from './connector-view';
import { SelectionLayer } from './selection-layer';
import { RemoteCursorsLayer } from '@/features/presence/remote-cursors-layer';
import type { CursorSetter, LaserSetter } from '@/features/sync/use-board-sync';
import { ZoomBar } from './zoom-bar';
import { ContextMenu } from './context-menu';
import { getTool } from '../tools/tools';
import { pinchStep, screenToCanvas, wheelStep, type Point } from '../engine/viewport';
import { applyStagePixelRatio, clampDpr, snapHairlineScreen } from '../engine/dpr';
import { useDevicePixelRatio } from '../hooks/use-device-pixel-ratio';
import { snapMove, snapToGrid, type Guide } from '../engine/snapping';
import { getBounds, isBoxType, type Rect as Bounds } from '../model/element';
import { elementsInFrame } from '../model/frame';
import { cullElements, viewportBounds } from '../model/culling';
import { dragPatches } from '../model/drag';
import { connectorsInMarquee, elementsInMarquee, marqueeRect, mergeMarquee } from '../model/selection';
import { descendantIds, layoutMindMap } from '../model/mindmap';
import { addElements, removeElements, updateElements } from '../model/commands';
import type { Doc } from '../model/commands';
import { deriveEmbed } from '../model/embed';
import type { CanvasStore } from '../engine/canvas-store';
import { MindEdgesLayer } from './mind-edges-layer';
import { CommentsLayer } from './comments-layer';
import { VoteOverlay } from './vote-overlay';
import { uploadImage } from '../api/upload-image';

const GRID = 24;
/** How long a laser-trail point stays visible before it fully fades out. */
const LASER_FADE_MS = 1000;

interface Editing {
  id: string;
  value: string;
}
interface Menu {
  x: number;
  y: number;
  ids: string[];
}

export function CanvasStage({
  store,
  awareness,
  onCursor,
  onLaser,
  onAddComment,
  votingUserId,
  onStageMount,
}: {
  store: CanvasStore;
  awareness?: Awareness;
  onCursor?: CursorSetter;
  /** Broadcasts local laser pointer position via Awareness. */
  onLaser?: LaserSetter;
  /** Called when the user picks "Add comment" from the context menu. */
  onAddComment?: (elementId: string) => void;
  /** Current user id — required for vote clicks in voting mode. */
  votingUserId?: string;
  /** Called with the Konva Stage instance once it mounts, and with null on unmount. */
  onStageMount?: (stage: Konva.Stage | null) => void;
}): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const nodes = useRef<Map<string, Konva.Group>>(new Map());
  const dragRef = useRef<{
    ids: string[];
    start: Map<string, { x: number; y: number }>;
    /** Snap candidate bounds, captured once at gesture start. */
    snapTargets: Bounds[];
  } | null>(null);
  const connRef = useRef<{
    id: string;
    from: NonNullable<CanvasElement['from']>;
    fromId: string | null;
    /** Captured once at gesture start: recomputing it per frame off a doc that
     *  already contains the draft would ratchet the z-index up on every move. */
    zIndex: number;
  } | null>(null);
  // Image tool: a hidden file input + the picked file awaiting a click-to-place.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingImageRef = useRef<File | null>(null);
  // Marquee (rubber-band) selection state for the select tool. `base` is the
  // selection captured at gesture start (for additive shift-drag); `moved`
  // distinguishes a real drag from a plain click (which clears the selection).
  const marqueeRef = useRef<{ start: { x: number; y: number }; base: string[]; additive: boolean; moved: boolean } | null>(null);
  // Finger positions from the previous frame of a two-finger gesture, or null
  // when fewer than two fingers are down.
  const pinchRef = useRef<[Point, Point] | null>(null);
  // cancelGesture closes over the live tool/ctx, but the touch listener below
  // binds once — so it reaches the current one through a ref.
  const cancelGestureRef = useRef<() => void>(() => {});
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [editing, setEditing] = useState<Editing | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  // Live marquee rectangle (canvas coords) + hit count, rendered while dragging.
  const [marquee, setMarquee] = useState<Bounds | null>(null);
  const [marqueeCount, setMarqueeCount] = useState(0);
  // Local laser pointer trail (canvas coords + timestamp) shown to the user
  // driving the laser tool — a fading stroke that follows the cursor and decays,
  // like Excalidraw. Remote users' lasers render via RemoteCursorsLayer.
  const [laserTrail, setLaserTrail] = useState<{ x: number; y: number; t: number }[]>([]);
  // Current laser dot position — follows the cursor on hover (no click needed)
  // and stays put when the cursor is still, like Excalidraw's laser pointer.
  const [laserCursor, setLaserCursor] = useState<{ x: number; y: number } | null>(null);
  // A high-polling-rate mouse fires pointermove several times per displayed
  // frame. Each one used to push two state updates and re-render the stage, so
  // the trail was recomputed for positions that were never painted. Coalescing
  // onto requestAnimationFrame caps the work at one update per frame.
  const laserRaf = useRef<number | null>(null);
  const laserPending = useRef<{ x: number; y: number; t: number } | null>(null);
  const queueLaser = useCallback((p: { x: number; y: number }): void => {
    laserPending.current = { x: p.x, y: p.y, t: Date.now() };
    if (laserRaf.current !== null) return;
    laserRaf.current = requestAnimationFrame(() => {
      laserRaf.current = null;
      const q = laserPending.current;
      if (!q) return;
      setLaserCursor(q);
      setLaserTrail((prev) => [...prev, q].filter((r) => q.t - r.t < LASER_FADE_MS).slice(-80));
    });
  }, []);
  useEffect(
    () => () => {
      if (laserRaf.current !== null) cancelAnimationFrame(laserRaf.current);
    },
    [],
  );

  // While a laser trail exists, prune expired points on a timer so the trail
  // fades and clears even when the cursor stops moving (re-render per tick).
  useEffect(() => {
    if (laserTrail.length === 0) return;
    const id = setInterval(() => {
      const now = Date.now();
      setLaserTrail((prev) => prev.filter((q) => now - q.t < LASER_FADE_MS));
    }, 60);
    return () => clearInterval(id);
  }, [laserTrail.length]);

  const doc = useStore(store, (s) => s.doc);
  const view = useStore(store, (s) => s.view);
  const tool = useStore(store, (s) => s.tool);
  const theme = useStore(store, (s) => s.theme);
  const selected = useStore(store, (s) => s.selected);
  const gridEnabled = useStore(store, (s) => s.gridEnabled);
  const votingMode = useStore(store, (s) => s.votingMode);
  const activeTagFilter = useStore(store, (s) => s.activeTagFilter);
  const s = store.getState();

  const panning = tool === 'pan';
  // Sorting and partitioning every element ran on every render, including the
  // ones a drag fires per frame. Keyed on the doc so it only reruns on an edit.
  const { ordered, elements, connectors } = useMemo(() => {
    const all = Object.values(doc.elements).sort((a, b) => a.zIndex - b.zIndex);
    return {
      ordered: all,
      elements: all.filter((e) => e.type !== 'connector'),
      connectors: all.filter((e) => e.type === 'connector'),
    };
  }, [doc]);

  // Only mount elements that can affect the frame. Selected elements and the
  // one being edited stay mounted wherever they are: the Transformer attaches
  // to a live node, and an in-flight gesture needs one to move.
  const keepMounted = useMemo(
    () => new Set(editing ? [...selected, editing.id] : selected),
    [selected, editing],
  );
  const visibleElements = useMemo(
    () => cullElements(elements, viewportBounds(view, size), keepMounted),
    [elements, view, size, keepMounted],
  );

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const apply = (): void =>
      setSize((prev) =>
        prev.width === el.clientWidth && prev.height === el.clientHeight
          ? prev
          : { width: el.clientWidth, height: el.clientHeight },
      );
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Keep the backing store matched to the display. `size` is the CSS box in
  // logical pixels; the ratio decides how many device pixels back each of them.
  // Both inputs move independently - a monitor change alters the ratio without
  // resizing the container, and a window resize alters the affordable ratio
  // without the device changing - so the stage is re-rated on either.
  const rawDpr = useDevicePixelRatio();
  const [renderDpr, setRenderDpr] = useState(1);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const dpr = clampDpr(rawDpr, size, { layers: stage.getLayers().length });
    applyStagePixelRatio(stage, dpr);
    // Mirrored into state so hairline alignment reads the SAME resolved ratio
    // the backing store was sized with. Re-setting an equal number is a no-op.
    setRenderDpr(dpr);
  }, [rawDpr, size]);

  // Two-finger touch: pinch to zoom, drag to pan — available under every tool.
  // Bound natively rather than through Konva so a gesture that starts on top of
  // a shape still reaches us, and so touchmove can be non-passive and cancel the
  // browser's own page zoom on iOS.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const fingers = (e: TouchEvent): [Point, Point] | null => {
      const a = e.touches[0];
      const b = e.touches[1];
      if (!a || !b) return null;
      const r = el.getBoundingClientRect();
      return [
        { x: a.clientX - r.left, y: a.clientY - r.top },
        { x: b.clientX - r.left, y: b.clientY - r.top },
      ];
    };
    const onStart = (e: TouchEvent): void => {
      const p = fingers(e);
      if (!p) return;
      // Without this, a pinch that began on a shape would drag the shape too,
      // and a pinch begun with a drawing tool would strand a half-drawn shape.
      stageRef.current?.stopDrag();
      for (const node of nodes.current.values()) if (node.isDragging()) node.stopDrag();
      cancelGestureRef.current();
      pinchRef.current = p;
    };
    const onMove = (e: TouchEvent): void => {
      const prev = pinchRef.current;
      const next = fingers(e);
      if (!prev || !next) return;
      e.preventDefault();
      const state = store.getState();
      state.setView(pinchStep(state.view, prev, next));
      pinchRef.current = next;
    };
    const onEnd = (e: TouchEvent): void => {
      if (e.touches.length < 2) pinchRef.current = null;
    };
    el.addEventListener('touchstart', onStart, { passive: false });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [store]);

  // Expose the Konva Stage instance to the parent so it can trigger exports.
  useEffect(() => {
    onStageMount?.(stageRef.current);
    return () => onStageMount?.(null);
  }, [onStageMount]);

  const addImageFromFile = (file: File, p: { x: number; y: number }): void => {
    // Try S3 upload first; fall back to data-URL if it fails (offline / no S3 config).
    void (async () => {
      let assetUrl: string;
      let naturalW: number;
      let naturalH: number;

      try {
        const result = await uploadImage(file);
        assetUrl = result.assetUrl;
        naturalW = result.width;
        naturalH = result.height;
      } catch (err) {
        console.warn('[canvas] S3 upload failed, falling back to data-URL', err);
        // Inline fallback: read file as data-URL, probe dimensions synchronously.
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
        const dims = await new Promise<{ w: number; h: number }>((resolve) => {
          const probe = new window.Image();
          probe.onload = () => resolve({ w: probe.naturalWidth, h: probe.naturalHeight });
          probe.onerror = () => resolve({ w: 0, h: 0 });
          probe.src = dataUrl;
        });
        assetUrl = dataUrl;
        naturalW = dims.w;
        naturalH = dims.h;
      }

      const max = 360;
      const scale = Math.min(1, naturalW ? max / naturalW : 1);
      const iw = naturalW * scale;
      const ih = naturalH * scale;
      const st = store.getState();
      const zs = Object.values(st.doc.elements).map((e) => e.zIndex);
      st.dispatch(
        addElements([
          {
            id: crypto.randomUUID(),
            type: 'image',
            x: p.x - iw / 2,
            y: p.y - ih / 2,
            rotation: 0,
            opacity: 1,
            zIndex: zs.length ? Math.max(...zs) + 1 : 0,
            fill: null,
            stroke: 'auto',
            strokeWidth: 0,
            strokeStyle: 'solid',
            assetUrl,
            width: iw,
            height: ih,
            naturalWidth: naturalW,
            naturalHeight: naturalH,
          },
        ]),
      );
    })();
  };

  useEffect(() => {
    function onPaste(e: ClipboardEvent): void {
      const items = e.clipboardData?.items;
      if (!items) return;

      const itemList = Array.from(items);

      // Image paste takes priority — keep existing behavior intact.
      for (const it of itemList) {
        if (it.type.startsWith('image/')) {
          const file = it.getAsFile();
          if (file) addImageFromFile(file, screenToCanvas(view, { x: size.width / 2, y: size.height / 2 }));
          return;
        }
      }

      // URL text paste → create an embed card at viewport center.
      for (const it of itemList) {
        if (it.type === 'text/plain') {
          it.getAsString((text) => {
            const trimmed = text.trim();
            // Only handle single-line pastes that look like URLs.
            if (trimmed.includes('\n')) return;
            const meta = deriveEmbed(trimmed);
            if (!meta) return;
            const center = screenToCanvas(view, { x: size.width / 2, y: size.height / 2 });
            const w = 240;
            const h = 72;
            const st = store.getState();
            const zs = Object.values(st.doc.elements).map((el) => el.zIndex);
            st.dispatch(
              addElements([
                {
                  id: crypto.randomUUID(),
                  type: 'embed',
                  x: center.x - w / 2,
                  y: center.y - h / 2,
                  rotation: 0,
                  opacity: 1,
                  zIndex: zs.length ? Math.max(...zs) + 1 : 0,
                  fill: null,
                  stroke: 'auto',
                  strokeWidth: 1,
                  strokeStyle: 'solid',
                  width: w,
                  height: h,
                  url: meta.url,
                  title: meta.title,
                  faviconUrl: meta.faviconUrl,
                },
              ]),
            );
          });
          return;
        }
      }
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [view, size]);

  // Tab/Enter: create child/sibling mindnode and immediately open text edit.
  useEffect(() => {
    function onMindKey(e: KeyboardEvent): void {
      if (e.key !== 'Tab' && e.key !== 'Enter') return;
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
      const st = store.getState();
      if (st.selected.length !== 1) return;
      const selId = st.selected[0]!;
      const selEl = st.doc.elements[selId];
      if (selEl?.type !== 'mindnode') return;
      e.preventDefault();
      const allNodes = Object.values(st.doc.elements);
      const zs = allNodes.map((n) => n.zIndex);
      const nextZ = zs.length ? Math.max(...zs) + 1 : 0;
      const parentId = e.key === 'Tab' ? selId : selEl.parentId;
      const newNode: CanvasElement = {
        id: crypto.randomUUID(),
        type: 'mindnode',
        x: selEl.x + 200,
        y: selEl.y + 64,
        rotation: 0,
        opacity: 1,
        zIndex: nextZ,
        fill: null,
        stroke: '#6366F1',
        strokeWidth: 1.5,
        strokeStyle: 'solid',
        width: 140,
        height: 44,
        text: 'Idea',
        fontSize: 14,
        parentId,
      };
      // Re-layout all mindnodes including new one
      const mindNodes = allNodes.filter((n) => n.type === 'mindnode');
      const withNew = [...mindNodes, newNode];
      const layout = layoutMindMap(withNew);
      // Apply layout position to new node
      const newPos = layout[newNode.id];
      if (newPos) {
        newNode.x = newPos.x;
        newNode.y = newPos.y;
      }
      // Build patches for existing nodes that moved
      const patches: Record<string, { x: number; y: number }> = {};
      for (const [id, pos] of Object.entries(layout)) {
        if (id === newNode.id) continue;
        const existing = st.doc.elements[id];
        if (existing && (existing.x !== pos.x || existing.y !== pos.y)) {
          patches[id] = { x: pos.x, y: pos.y };
        }
      }
      // Single undo step: add + layout in one combined command
      const combinedCmd = {
        apply(d: Doc): Doc {
          let result = addElements([newNode]).apply(d);
          if (Object.keys(patches).length) result = updateElements(patches).apply(result);
          return result;
        },
      };
      st.dispatch(combinedCmd);
      st.setSelected([newNode.id]);
      // Open text edit immediately — read text from the new node directly
      setEditing({ id: newNode.id, value: newNode.text ?? '' });
    }
    window.addEventListener('keydown', onMindKey);
    return () => window.removeEventListener('keydown', onMindKey);
  }, [store]);

  const point = (): { x: number; y: number } => {
    const p = stageRef.current?.getPointerPosition() ?? { x: 0, y: 0 };
    return screenToCanvas(view, p);
  };
  const ctx = { store: s, getCanvasPoint: point };

  // Everything the per-element callbacks need, re-published after each commit.
  // Reading through a ref is what lets those callbacks carry empty dependency
  // arrays and stay referentially stable, so memo(ElementView) can skip work.
  // Written in a layout effect (not during render) so it is updated after the
  // commit that produced these values but before any user event can fire.
  const live = useRef({ selected, tool, votingMode, votingUserId, doc, elements, gridEnabled, s });
  useLayoutEffect(() => {
    live.current = { selected, tool, votingMode, votingUserId, doc, elements, gridEnabled, s };
  });


  // --- Marquee (rubber-band) selection ---------------------------------------
  const MARQUEE_THRESHOLD = 3; // screen px of drag before a click becomes a marquee

  const startMarquee = (additive: boolean): void => {
    marqueeRef.current = { start: point(), base: additive ? selected : [], additive, moved: false };
  };

  const updateMarquee = (): void => {
    const m = marqueeRef.current;
    if (!m) return;
    const p = point();
    // Ignore sub-pixel jitter so a plain click doesn't register as a drag.
    if (!m.moved && Math.hypot(p.x - m.start.x, p.y - m.start.y) * view.scale < MARQUEE_THRESHOLD) return;
    m.moved = true;
    const rect = marqueeRect(m.start, p);
    setMarquee(rect);
    const hits = [
      ...elementsInMarquee(elements, rect),
      ...connectorsInMarquee(connectors, doc.elements, rect),
    ];
    const next = mergeMarquee(m.base, hits, m.additive);
    s.setSelected(next);
    setMarqueeCount(next.length);
  };

  // Abandon an in-flight gesture without committing it. Called when a second
  // finger lands: what looked like a draw is really a pinch.
  const cancelGesture = (): void => {
    getTool(tool).onCancel?.(ctx);
    if (marqueeRef.current) {
      marqueeRef.current = null;
      setMarquee(null);
      setMarqueeCount(0);
    }
    const conn = connRef.current;
    if (conn) {
      connRef.current = null;
      s.applyTransient(removeElements([conn.id]));
    }
  };

  const endMarquee = (): void => {
    const m = marqueeRef.current;
    marqueeRef.current = null;
    setMarquee(null);
    setMarqueeCount(0);
    // A plain click on empty canvas (no drag) clears the selection, as before.
    if (m && !m.moved && !m.additive) s.setSelected([]);
  };

  // --- Image tool: place the picked file at the click point ------------------
  const placePendingImage = (): void => {
    const file = pendingImageRef.current;
    if (!file) return;
    pendingImageRef.current = null;
    addImageFromFile(file, point());
    s.setTool('select');
  };

  // Selecting the image tool opens the OS file picker; the chosen file is then
  // dropped on the next canvas click (picker → click-to-place).
  useEffect(() => {
    if (tool === 'image' && !pendingImageRef.current) fileInputRef.current?.click();
  }, [tool]);

  // Dismissing the picker without choosing a file reverts to the select tool.
  // ('cancel' isn't in React's input prop types, so bind it natively.)
  useEffect(() => {
    const input = fileInputRef.current;
    if (!input) return;
    const onCancel = (): void => {
      if (!pendingImageRef.current) store.getState().setTool('select');
    };
    input.addEventListener('cancel', onCancel);
    return () => input.removeEventListener('cancel', onCancel);
  }, [store]);

  // Escape cancels an in-progress marquee and restores the pre-drag selection.
  // Capture phase so it runs before the global Escape→deselect handler.
  useEffect(() => {
    function onEsc(e: KeyboardEvent): void {
      if (e.key !== 'Escape' || !marqueeRef.current) return;
      const { base } = marqueeRef.current;
      marqueeRef.current = null;
      setMarquee(null);
      setMarqueeCount(0);
      store.getState().setSelected(base);
    }
    window.addEventListener('keydown', onEsc, true);
    return () => window.removeEventListener('keydown', onEsc, true);
  }, [store]);

  const startEditing = useCallback((id: string): void => {
    const el = live.current.doc.elements[id];
    if (!el) return;
    setMenu(null);
    // Embed elements expose `title`; frames expose `name`; all others use `text`.
    const value = el.type === 'embed' ? (el.title ?? '') : el.type === 'frame' ? (el.name ?? '') : (el.text ?? '');
    setEditing({ id, value });
  }, []);

  const commitEdit = (): void => {
    if (editing) {
      const el = doc.elements[editing.id];
      const patch =
        el?.type === 'embed' ? { title: editing.value }
        : el?.type === 'frame' ? { name: editing.value }
        : { text: editing.value };
      s.dispatch(updateElements({ [editing.id]: patch }));
    }
    setEditing(null);
  };

  /**
   * Replace the guide set only when it actually differs.
   *
   * `setGuides([])` with a literal ran on every drag frame, and a fresh empty
   * array is a new identity - enough to re-render the whole element list 60
   * times a second while dragging a single shape.
   */
  const publishGuides = useCallback((next: Guide[]): void => {
    setGuides((prev) => {
      if (prev.length === 0 && next.length === 0) return prev;
      if (
        prev.length === next.length &&
        prev.every((g, i) => g.orientation === next[i]?.orientation && g.pos === next[i]?.pos)
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  const handleDragStart = useCallback((node: Konva.Group, el: CanvasElement): void => {
    const { selected, doc, elements, gridEnabled } = live.current;
    let movedIds = selected.includes(el.id) ? selected : [el.id];
    // If a frame is being dragged, include all elements currently inside it.
    if (el.type === 'frame') {
      const all = Object.values(doc.elements);
      const childIds = elementsInFrame(el, all);
      const extra = childIds.filter((id) => !movedIds.includes(id));
      movedIds = [...movedIds, ...extra];
    }
    // If a mindnode is being dragged, translate its entire subtree.
    if (el.type === 'mindnode') {
      const all = Object.values(doc.elements).filter((e) => e.type === 'mindnode');
      const childIds = descendantIds(el.id, all);
      const extra = childIds.filter((id) => !movedIds.includes(id));
      movedIds = [...movedIds, ...extra];
    }
    // Read start positions from the document rather than from mounted nodes.
    // A frame or mind-node drag moves descendants that may be culled, and those
    // have no node to ask — but the model always knows where they are.
    const start = new Map<string, { x: number; y: number }>();
    for (const id of movedIds) {
      const m = doc.elements[id];
      if (m) start.set(id, { x: m.x, y: m.y });
    }
    // Snap targets cannot change mid-gesture (nothing else moves while you
    // drag), so the candidate bounds are built once here rather than per frame.
    const snapTargets = gridEnabled
      ? []
      : elements.filter((e) => !movedIds.includes(e.id) && isBoxType(e.type)).map(getBounds);
    dragRef.current = { ids: movedIds, start, snapTargets };
  }, []);

  const handleDragMove = useCallback(
    (node: Konva.Group, el: CanvasElement): void => {
      const { gridEnabled } = live.current;
      const moving = { x: node.x(), y: node.y(), width: el.width ?? 0, height: el.height ?? 0 };
      if (gridEnabled) {
        node.position({ x: snapToGrid(moving.x, GRID), y: snapToGrid(moving.y, GRID) });
        publishGuides([]);
      } else {
        const res = snapMove(moving, dragRef.current?.snapTargets ?? [], 6);
        if (res.dx || res.dy) node.position({ x: node.x() + res.dx, y: node.y() + res.dy });
        publishGuides(res.guides);
      }
      // Move the rest of the selection/group by the same delta.
      const drag = dragRef.current;
      const s0 = drag?.start.get(el.id);
      if (drag && s0) {
        const dx = node.x() - s0.x;
        const dy = node.y() - s0.y;
        for (const id of drag.ids) {
          if (id === el.id) continue;
          const n = nodes.current.get(id);
          const st = drag.start.get(id);
          if (n && st) n.position({ x: st.x + dx, y: st.y + dy });
        }
      }
    },
    [publishGuides],
  );

  const handleDragEnd = useCallback(
    (node: Konva.Group, el: CanvasElement): void => {
      const drag = dragRef.current;
      dragRef.current = null;
      publishGuides([]);
      const patches = dragPatches(
        drag?.ids ?? [el.id],
        drag?.start ?? new Map(),
        el.id,
        { x: node.x(), y: node.y() },
      );
      if (Object.keys(patches).length) live.current.s.dispatch(updateElements(patches));
    },
    [publishGuides],
  );

  // Per-element callbacks. Stable across renders (all state read through
  // `live`) so ElementView's memo comparison can actually succeed.
  const handleElementSelect = useCallback((element: CanvasElement, additive: boolean): void => {
    const { votingMode, votingUserId, tool, selected, s } = live.current;
    if (votingMode) {
      // In voting mode, clicking an element adds one vote dot.
      if (votingUserId) s.voteElement(element.id, votingUserId, 1);
      return;
    }
    if (tool !== 'select') return;
    // Pressing on an already-selected element keeps the (possibly multi-)
    // selection so a drag moves everything together; a plain click without a
    // drag collapses it (handled in handleElementClick).
    if (!additive && selected.includes(element.id)) return;
    s.selectElement(element.id, additive);
  }, []);

  const handleElementClick = useCallback((element: CanvasElement, additive: boolean): void => {
    const { votingMode, tool, selected, s } = live.current;
    if (votingMode || tool !== 'select') return;
    // Plain click (no drag) on an element inside a multi-selection isolates it.
    if (!additive && selected.length > 1 && selected.includes(element.id)) {
      s.selectElement(element.id, false);
    }
  }, []);

  const handleElementEdit = useCallback(
    (element: CanvasElement): void => startEditing(element.id),
    [startEditing],
  );

  // Bumped whenever a SELECTED element's node appears or disappears.
  //
  // The Transformer resolves its targets through `nodes`, a mutable ref filled
  // in by these ref callbacks. Culling made that a moving target: selecting
  // everything mounts elements that were culled a moment ago, and the effect
  // that attaches the Transformer runs before their refs land, so it would
  // silently attach to only the handful that happened to be mounted already.
  // Publishing a version from the ref callback gives that effect something to
  // depend on that is guaranteed to change *after* the nodes exist.
  const [nodesVersion, setNodesVersion] = useState(0);
  const registerNode = useCallback((id: string, node: Konva.Group | null): void => {
    if (node) nodes.current.set(id, node);
    else nodes.current.delete(id);
    // Only the selection needs a live node, so a plain pan mounting scenery
    // does not trigger extra work. Read the selection from the store, not from
    // `live`: ref callbacks run during the commit that mounts these nodes,
    // before the layout effect that republishes `live`, so `live` still holds
    // the selection from *before* the select-all that caused the mount.
    if (store.getState().selected.includes(id)) setNodesVersion((v) => v + 1);
  }, [store]);

  const elementAt = (p: { x: number; y: number }): string | null => {
    const hits = elements.filter((e) => {
      if (!isBoxType(e.type)) return false;
      const b = getBounds(e);
      return p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;
    });
    return hits.length ? hits[hits.length - 1]!.id : null;
  };

  const nextConnectorZ = (): number => {
    const zs = ordered.map((e) => e.zIndex);
    return zs.length ? Math.max(...zs) + 1 : 0;
  };

  const buildConnector = (
    id: string,
    from: NonNullable<CanvasElement['from']>,
    to: CanvasElement['to'],
    zIndex: number,
  ): CanvasElement => {
    return {
      id,
      type: 'connector',
      x: 0,
      y: 0,
      rotation: 0,
      opacity: 1,
      zIndex,
      fill: null,
      stroke: s.activeStyle.stroke,
      strokeWidth: s.activeStyle.strokeWidth,
      strokeStyle: 'solid',
      from,
      to,
      endArrow: true,
    };
  };

  const handleConnectorDown = (): void => {
    const p = point();
    const fromId = elementAt(p);
    // Start on an element to bind to it, or on empty canvas for a free arrow.
    const from = fromId ? { elementId: fromId } : { x: p.x, y: p.y };
    const id = crypto.randomUUID();
    const zIndex = nextConnectorZ();
    s.applyTransient(addElements([buildConnector(id, from, { x: p.x, y: p.y }, zIndex)]));
    connRef.current = { id, from, fromId, zIndex };
  };

  const handleConnectorMove = (): void => {
    const draft = connRef.current;
    if (!draft) return;
    const p = point();
    // Re-send the WHOLE draft, not a patch. The store keeps a single transient
    // command and re-applies it to a base projected straight from Yjs — and the
    // draft is not in Yjs until mouse-up, so an updateElements would find
    // nothing to patch and resolve to nothing. That is why the connector was
    // invisible until the gesture ended. The draw tools already work this way
    // (see tools.ts); this brings the connector in line with them.
    s.applyTransient(addElements([buildConnector(draft.id, draft.from, { x: p.x, y: p.y }, draft.zIndex)]));
  };

  const handleConnectorUp = (): void => {
    const draft = connRef.current;
    connRef.current = null;
    if (!draft) return;
    s.applyTransient(removeElements([draft.id]));
    const p = point();
    const toId = elementAt(p);
    const to = toId && toId !== draft.fromId ? { elementId: toId } : { x: p.x, y: p.y };
    // Skip a zero-length free arrow (a click with no drag, not bound to elements).
    if (!draft.fromId && !toId) {
      const fx = (draft.from as { x?: number }).x ?? 0;
      const fy = (draft.from as { y?: number }).y ?? 0;
      if (Math.hypot(p.x - fx, p.y - fy) < 6) {
        s.setTool('select');
        return;
      }
    }
    s.dispatch(addElements([buildConnector(draft.id, draft.from, to, draft.zIndex)]));
    s.setTool('select');
  };

  useEffect(() => {
    cancelGestureRef.current = cancelGesture;
  });

  const editingEl = editing ? doc.elements[editing.id] : undefined;
  const gridStyle = gridEnabled
    ? {
        backgroundImage: 'radial-gradient(circle, rgba(128,128,128,0.3) 1px, transparent 1px)',
        backgroundSize: `${GRID * view.scale}px ${GRID * view.scale}px`,
        backgroundPosition: `${view.x}px ${view.y}px`,
      }
    : undefined;

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full touch-none overflow-hidden overscroll-none bg-paper dark:bg-paper-dark"
      style={gridStyle}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files?.[0];
        if (file && file.type.startsWith('image/') && containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          addImageFromFile(file, screenToCanvas(view, { x: e.clientX - rect.left, y: e.clientY - rect.top }));
        }
      }}
    >
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        x={view.x}
        y={view.y}
        scaleX={view.scale}
        scaleY={view.scale}
        draggable={panning}
        onPointerDown={(e: KonvaEventObject<PointerEvent>) => {
          setMenu(null);
          if (tool === 'image') {
            // Drop the already-picked image here; ignore clicks before a file is chosen.
            if (pendingImageRef.current) placePendingImage();
            return;
          }
          if (tool === 'connector') {
            handleConnectorDown();
            return;
          }
          const onStage = e.target === e.target.getStage();
          if (tool === 'select') {
            // Drag on empty canvas = marquee select; element clicks select via ElementView.
            if (onStage) startMarquee(e.evt.shiftKey);
            return;
          }
          getTool(tool).onDown(ctx, onStage ? 'stage' : 'element');
        }}
        onPointerMove={() => {
          const p = stageRef.current?.getPointerPosition();
          if (p) {
            const cp = screenToCanvas(view, p);
            if (onCursor) onCursor(cp);
            if (onLaser) onLaser(tool === 'laser' ? cp : null);
            if (tool === 'laser') queueLaser(cp);
          }
          if (tool === 'connector') {
            handleConnectorMove();
            return;
          }
          if (tool === 'select') {
            if (marqueeRef.current) updateMarquee();
            return;
          }
          if (tool === 'laser') return; // laser tool draws nothing persistent on the canvas
          getTool(tool).onMove(ctx);
        }}
        onPointerLeave={() => { onCursor?.(null); onLaser?.(null); setLaserTrail([]); setLaserCursor(null); if (marqueeRef.current) endMarquee(); }}
        onPointerUp={() => {
          if (tool === 'connector') {
            handleConnectorUp();
            return;
          }
          if (tool === 'select') {
            endMarquee();
            return;
          }
          getTool(tool).onUp(ctx);
        }}
        onContextMenu={(e: KonvaEventObject<PointerEvent>) => {
          e.evt.preventDefault();
          const pointer = stageRef.current?.getPointerPosition();
          if (!pointer) {
            setMenu(null);
            return;
          }
          const group = e.target.findAncestor('.element', true) as Konva.Group | undefined;
          if (!group) {
            // Right-click on the empty board: open the canvas menu (Select all / Clear canvas).
            s.setSelected([]);
            setMenu({ x: pointer.x, y: pointer.y, ids: [] });
            return;
          }
          const id = group.id();
          const ids = selected.includes(id) ? selected : [id];
          s.setSelected(ids);
          setMenu({ x: pointer.x, y: pointer.y, ids });
        }}
        onWheel={(e) => {
          e.evt.preventDefault();
          const p = stageRef.current?.getPointerPosition();
          if (p) s.setView(wheelStep(view, e.evt, p));
        }}
        onDragEnd={(e) => {
          if (e.target === stageRef.current) s.setView({ ...view, x: e.target.x(), y: e.target.y() });
        }}
        style={{ cursor: votingMode ? 'cell' : panning ? 'grab' : tool === 'select' ? 'default' : 'crosshair' }}
      >
        <MindEdgesLayer store={store} />
        <Layer>
          {connectors.map((c) => (
            <ConnectorView
              key={c.id}
              connector={c}
              elements={doc.elements}
              theme={theme}
              selected={selected.includes(c.id)}
              onSelect={(additive) => {
                if (tool === 'select') s.selectElement(c.id, additive);
              }}
              onMove={(dx, dy) => {
                const cur = doc.elements[c.id];
                if (!cur) return;
                s.dispatch(
                  updateElements({
                    [c.id]: {
                      from: { x: (cur.from?.x ?? 0) + dx, y: (cur.from?.y ?? 0) + dy },
                      to: { x: (cur.to?.x ?? 0) + dx, y: (cur.to?.y ?? 0) + dy },
                    },
                  }),
                );
              }}
            />
          ))}
          {visibleElements.map((element) => {
            // When a tag filter is active, dim elements that don't match.
            // Elements with no tags array also do not match.
            let filterOpacity: number | undefined;
            if (activeTagFilter !== null) {
              const matches = element.tags?.includes(activeTagFilter) ?? false;
              filterOpacity = matches ? (element.opacity ?? 1) : (element.opacity ?? 1) * 0.15;
            }
            return (
              <ElementView
                key={element.id}
                element={element}
                theme={theme}
                draggable={tool === 'select' && !votingMode}
                filterOpacity={filterOpacity}
                onSelect={handleElementSelect}
                onClick={handleElementClick}
                onEdit={handleElementEdit}
                onDragStart={handleDragStart}
                onDragMove={handleDragMove}
                onDragEnd={handleDragEnd}
                registerNode={registerNode}
              />
            );
          })}
          {guides.map((g, i) => {
            // Align in screen space (where device pixels live), then map back
            // through the zoom transform so the Line still takes canvas coords.
            const offset = g.orientation === 'v' ? view.x : view.y;
            const pos =
              (snapHairlineScreen(g.pos * view.scale + offset, renderDpr) - offset) / view.scale;
            return (
              <Line
                key={`guide-${i}`}
                points={
                  g.orientation === 'v'
                    ? [pos, -100000, pos, 100000]
                    : [-100000, pos, 100000, pos]
                }
                stroke="#3B5BFF"
                strokeWidth={1 / view.scale}
                listening={false}
              />
            );
          })}
          {marquee && (
            <Rect
              x={marquee.x}
              y={marquee.y}
              width={marquee.width}
              height={marquee.height}
              fill="rgba(59,91,255,0.12)"
              stroke="#3B5BFF"
              strokeWidth={1 / view.scale}
              dash={[4 / view.scale, 4 / view.scale]}
              listening={false}
            />
          )}
          <SelectionLayer store={store} nodes={nodes} nodesVersion={nodesVersion} />
        </Layer>
        {awareness && <RemoteCursorsLayer awareness={awareness} store={store} />}
        <CommentsLayer store={store} scale={view.scale} />
        <VoteOverlay store={store} scale={view.scale} />
        {tool === 'laser' && laserCursor && (
          <Layer listening={false}>
            {laserTrail.map((p, i) => {
              if (i === 0) return null;
              const prev = laserTrail[i - 1]!;
              const op = Math.max(0, 1 - (Date.now() - p.t) / LASER_FADE_MS);
              if (op <= 0) return null;
              return (
                <Line
                  key={`${p.t}-${i}`}
                  points={[prev.x, prev.y, p.x, p.y]}
                  stroke="#FF5A5F"
                  strokeWidth={4 / view.scale}
                  opacity={op}
                  lineCap="round"
                  lineJoin="round"
                />
              );
            })}
            {/* Persistent dot at the cursor — visible on hover, no click needed. */}
            <Circle
              x={laserCursor.x}
              y={laserCursor.y}
              radius={6 / view.scale}
              fill="#FF5A5F"
              shadowColor="#FF5A5F"
              shadowBlur={12 / view.scale}
              shadowOpacity={0.9}
            />
          </Layer>
        )}
      </Stage>

      {/* Inline text editor — type directly inside any shape. */}
      {editing && editingEl && (
        <textarea
          autoFocus
          value={editing.value}
          onChange={(e) => setEditing({ id: editing.id, value: e.target.value })}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setEditing(null);
            if (e.key === 'Enter' && !e.shiftKey && editingEl.type !== 'sticky') {
              e.preventDefault();
              commitEdit();
            }
          }}
          className="absolute z-10 resize-none rounded-md border border-brand bg-raised p-2 text-ink shadow-float outline-none dark:bg-raised-dark dark:text-ink-dark"
          style={{
            left: view.x + editingEl.x * view.scale,
            top: view.y + editingEl.y * view.scale,
            width: (editingEl.width ?? 200) * view.scale,
            height: (editingEl.height ?? 40) * view.scale,
            fontSize: (editingEl.fontSize ?? 16) * view.scale,
            // Match the rendered element: code blocks edit as left-aligned
            // monospace on a dark surface; everything else mirrors the element's
            // own font family / weight / style / alignment / color for WYSIWYG.
            fontFamily:
              editingEl.type === 'code'
                ? "'JetBrains Mono', ui-monospace, monospace"
                : (editingEl.fontFamily ?? 'Inter, sans-serif'),
            fontWeight:
              editingEl.fontWeight === 'bold' ||
              (typeof editingEl.fontWeight === 'number' && editingEl.fontWeight >= 600)
                ? 700
                : 400,
            fontStyle: editingEl.italic ? 'italic' : 'normal',
            textAlign: editingEl.type === 'code' ? 'left' : (editingEl.textAlign ?? 'center'),
            ...(editingEl.type === 'code'
              ? { background: '#13131b', color: '#e6e6e6' }
              : editingEl.textColor && editingEl.textColor !== 'auto'
                ? { color: editingEl.textColor }
                : {}),
          }}
        />
      )}

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          ids={menu.ids}
          store={store}
          onEditText={() => startEditing(menu.ids[0]!)}
          onClose={() => setMenu(null)}
          onAddComment={onAddComment}
        />
      )}

      {/* Live "N selected" badge while dragging a marquee. */}
      {marquee && marqueeCount > 0 && (
        <div
          className="pointer-events-none absolute z-10 rounded bg-brand px-1.5 py-0.5 text-xs font-medium text-white shadow-float"
          style={{
            left: view.x + (marquee.x + marquee.width) * view.scale + 8,
            top: view.y + (marquee.y + marquee.height) * view.scale + 8,
          }}
        >
          {marqueeCount} selected
        </div>
      )}

      {/* Hidden picker for the image tool (opened on tool select, placed on click). */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = ''; // allow re-picking the same file on a later activation
          if (f) pendingImageRef.current = f; // cursor is crosshair; next canvas click places it
          else s.setTool('select');
        }}
      />

      <ZoomBar store={store} size={size} />
    </div>
  );
}
