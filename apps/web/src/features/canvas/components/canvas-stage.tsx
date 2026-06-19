import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Circle, Layer, Line, Stage } from 'react-konva';
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
import { screenToCanvas, zoomAtPoint } from '../engine/viewport';
import { snapMove, snapToGrid, type Guide } from '../engine/snapping';
import { getBounds, isBoxType } from '../model/element';
import { elementsInFrame } from '../model/frame';
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
  const dragRef = useRef<{ ids: string[]; start: Map<string, { x: number; y: number }> } | null>(null);
  const connRef = useRef<{ id: string; fromId: string } | null>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [editing, setEditing] = useState<Editing | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  // Local laser pointer position (canvas coords) shown to the user driving the
  // laser tool. Remote users' lasers render via RemoteCursorsLayer.
  const [laserPoint, setLaserPoint] = useState<{ x: number; y: number } | null>(null);

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
  const ordered = Object.values(doc.elements).sort((a, b) => a.zIndex - b.zIndex);
  const elements = ordered.filter((e) => e.type !== 'connector');
  const connectors = ordered.filter((e) => e.type === 'connector');

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const apply = (): void => setSize({ width: el.clientWidth, height: el.clientHeight });
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Expose the Konva Stage instance to the parent so it can trigger exports.
  useEffect(() => {
    onStageMount?.(stageRef.current);
    return () => onStageMount?.(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const startEditing = (id: string): void => {
    const el = doc.elements[id];
    if (!el) return;
    setMenu(null);
    // Embed elements expose `title`; frames expose `name`; all others use `text`.
    const value = el.type === 'embed' ? (el.title ?? '') : el.type === 'frame' ? (el.name ?? '') : (el.text ?? '');
    setEditing({ id, value });
  };

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

  const handleDragStart = (node: Konva.Group, el: CanvasElement): void => {
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
    const start = new Map<string, { x: number; y: number }>();
    for (const id of movedIds) {
      const n = id === el.id ? node : nodes.current.get(id);
      if (n) start.set(id, { x: n.x(), y: n.y() });
    }
    dragRef.current = { ids: movedIds, start };
  };

  const handleDragMove = (node: Konva.Group, el: CanvasElement): void => {
    const moving = { x: node.x(), y: node.y(), width: el.width ?? 0, height: el.height ?? 0 };
    const movingIds = dragRef.current?.ids ?? [el.id];
    if (gridEnabled) {
      node.position({ x: snapToGrid(moving.x, GRID), y: snapToGrid(moving.y, GRID) });
      setGuides([]);
    } else {
      const candidates = elements
        .filter((e) => !movingIds.includes(e.id) && isBoxType(e.type))
        .map(getBounds);
      const res = snapMove(moving, candidates, 6);
      if (res.dx || res.dy) node.position({ x: node.x() + res.dx, y: node.y() + res.dy });
      setGuides(res.guides);
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
  };

  const handleDragEnd = (node: Konva.Group, el: CanvasElement): void => {
    const drag = dragRef.current;
    dragRef.current = null;
    setGuides([]);
    const ids = drag?.ids ?? [el.id];
    const patches: Record<string, { x: number; y: number }> = {};
    for (const id of ids) {
      const n = id === el.id ? node : nodes.current.get(id);
      if (n) patches[id] = { x: n.x(), y: n.y() };
    }
    if (Object.keys(patches).length) s.dispatch(updateElements(patches));
  };

  const elementAt = (p: { x: number; y: number }): string | null => {
    const hits = elements.filter((e) => {
      if (!isBoxType(e.type)) return false;
      const b = getBounds(e);
      return p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;
    });
    return hits.length ? hits[hits.length - 1]!.id : null;
  };

  const buildConnector = (id: string, fromId: string, to: CanvasElement['to']): CanvasElement => {
    const zs = ordered.map((e) => e.zIndex);
    return {
      id,
      type: 'connector',
      x: 0,
      y: 0,
      rotation: 0,
      opacity: 1,
      zIndex: zs.length ? Math.max(...zs) + 1 : 0,
      fill: null,
      stroke: s.activeStyle.stroke,
      strokeWidth: s.activeStyle.strokeWidth,
      strokeStyle: 'solid',
      from: { elementId: fromId },
      to,
      endArrow: true,
    };
  };

  const handleConnectorDown = (): void => {
    const p = point();
    const fromId = elementAt(p);
    if (!fromId) return;
    const id = crypto.randomUUID();
    s.applyTransient(addElements([buildConnector(id, fromId, { x: p.x, y: p.y })]));
    connRef.current = { id, fromId };
  };

  const handleConnectorMove = (): void => {
    const draft = connRef.current;
    if (!draft) return;
    const p = point();
    s.applyTransient(updateElements({ [draft.id]: { to: { x: p.x, y: p.y } } }));
  };

  const handleConnectorUp = (): void => {
    const draft = connRef.current;
    connRef.current = null;
    if (!draft) return;
    s.applyTransient(removeElements([draft.id]));
    const p = point();
    const toId = elementAt(p);
    const to = toId && toId !== draft.fromId ? { elementId: toId } : { x: p.x, y: p.y };
    s.dispatch(addElements([buildConnector(draft.id, draft.fromId, to)]));
    s.setTool('select');
  };

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
      className="relative h-full w-full overflow-hidden bg-paper dark:bg-paper-dark"
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
        onMouseDown={(e: KonvaEventObject<MouseEvent>) => {
          setMenu(null);
          if (tool === 'connector') {
            handleConnectorDown();
            return;
          }
          const onStage = e.target === e.target.getStage();
          if (tool === 'select') {
            if (onStage) s.setSelected([]);
            return;
          }
          getTool(tool).onDown(ctx, onStage ? 'stage' : 'element');
        }}
        onMouseMove={() => {
          const p = stageRef.current?.getPointerPosition();
          if (p) {
            const cp = screenToCanvas(view, p);
            if (onCursor) onCursor(cp);
            if (onLaser) onLaser(tool === 'laser' ? cp : null);
            if (tool === 'laser') setLaserPoint(cp);
          }
          if (tool === 'connector') {
            handleConnectorMove();
            return;
          }
          if (tool === 'laser') return; // laser tool draws nothing persistent on the canvas
          getTool(tool).onMove(ctx);
        }}
        onMouseLeave={() => { onCursor?.(null); onLaser?.(null); setLaserPoint(null); }}
        onMouseUp={() => {
          if (tool === 'connector') {
            handleConnectorUp();
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
          const p = stageRef.current!.getPointerPosition()!;
          s.setView(zoomAtPoint(view, p, e.evt.deltaY > 0 ? 1 / 1.1 : 1.1));
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
            />
          ))}
          {elements.map((element) => {
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
                onSelect={(additive) => {
                  if (votingMode) {
                    // In voting mode, clicking an element adds one vote dot.
                    if (votingUserId) s.voteElement(element.id, votingUserId, 1);
                    return;
                  }
                  if (tool !== 'select') return;
                  s.selectElement(element.id, additive);
                }}
                onEdit={() => startEditing(element.id)}
                onDragStart={(node) => handleDragStart(node, element)}
                onDragMove={(node) => handleDragMove(node, element)}
                onDragEnd={(node) => handleDragEnd(node, element)}
                registerNode={(id, node) => {
                  if (node) nodes.current.set(id, node);
                  else nodes.current.delete(id);
                }}
              />
            );
          })}
          {guides.map((g, i) => (
            <Line
              key={`guide-${i}`}
              points={
                g.orientation === 'v'
                  ? [g.pos, -100000, g.pos, 100000]
                  : [-100000, g.pos, 100000, g.pos]
              }
              stroke="#3B5BFF"
              strokeWidth={1 / view.scale}
              listening={false}
            />
          ))}
          <SelectionLayer store={store} nodes={nodes} />
        </Layer>
        {awareness && <RemoteCursorsLayer awareness={awareness} store={store} />}
        <CommentsLayer store={store} scale={view.scale} />
        <VoteOverlay store={store} scale={view.scale} />
        {tool === 'laser' && laserPoint && (
          <Layer listening={false}>
            <Circle
              x={laserPoint.x}
              y={laserPoint.y}
              radius={6 / view.scale}
              fill="#FF5A5F"
              shadowColor="#FF5A5F"
              shadowBlur={12 / view.scale}
              shadowOpacity={0.85}
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
          className="absolute z-10 resize-none rounded-md border border-brand bg-raised p-2 text-center text-ink shadow-float outline-none dark:bg-raised-dark dark:text-ink-dark"
          style={{
            left: view.x + editingEl.x * view.scale,
            top: view.y + editingEl.y * view.scale,
            width: (editingEl.width ?? 200) * view.scale,
            height: (editingEl.height ?? 40) * view.scale,
            fontSize: (editingEl.fontSize ?? 16) * view.scale,
            fontFamily: 'Inter, sans-serif',
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

      <ZoomBar store={store} size={size} />
    </div>
  );
}
