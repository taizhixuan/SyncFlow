import { useLayoutEffect, useRef, useState } from 'react';
import { Layer, Line, Stage } from 'react-konva';
import { useStore } from 'zustand';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { CanvasElement } from '@syncflow/shared';
import { ElementView } from './element-view';
import { SelectionLayer } from './selection-layer';
import { ZoomBar } from './zoom-bar';
import { ContextMenu } from './context-menu';
import { getTool } from '../tools/tools';
import { screenToCanvas, zoomAtPoint } from '../engine/viewport';
import { snapMove, snapToGrid, type Guide } from '../engine/snapping';
import { getBounds, isBoxType } from '../model/element';
import { updateElements } from '../model/commands';
import type { CanvasStore } from '../engine/canvas-store';

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

export function CanvasStage({ store }: { store: CanvasStore }): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const nodes = useRef<Map<string, Konva.Group>>(new Map());
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [editing, setEditing] = useState<Editing | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);

  const doc = useStore(store, (s) => s.doc);
  const view = useStore(store, (s) => s.view);
  const tool = useStore(store, (s) => s.tool);
  const theme = useStore(store, (s) => s.theme);
  const selected = useStore(store, (s) => s.selected);
  const gridEnabled = useStore(store, (s) => s.gridEnabled);
  const s = store.getState();

  const panning = tool === 'pan';
  const elements = Object.values(doc.elements).sort((a, b) => a.zIndex - b.zIndex);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const apply = (): void => setSize({ width: el.clientWidth, height: el.clientHeight });
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const point = (): { x: number; y: number } => {
    const p = stageRef.current?.getPointerPosition() ?? { x: 0, y: 0 };
    return screenToCanvas(view, p);
  };
  const ctx = { store: s, getCanvasPoint: point };

  const startEditing = (id: string): void => {
    const el = doc.elements[id];
    if (!el) return;
    setMenu(null);
    setEditing({ id, value: el.text ?? '' });
  };

  const commitEdit = (): void => {
    if (editing) s.dispatch(updateElements({ [editing.id]: { text: editing.value } }));
    setEditing(null);
  };

  const handleDragMove = (node: Konva.Group, el: CanvasElement): void => {
    const moving = { x: node.x(), y: node.y(), width: el.width ?? 0, height: el.height ?? 0 };
    if (gridEnabled) {
      node.position({ x: snapToGrid(moving.x, GRID), y: snapToGrid(moving.y, GRID) });
      return;
    }
    const candidates = elements.filter((e) => e.id !== el.id && isBoxType(e.type)).map(getBounds);
    const res = snapMove(moving, candidates, 6);
    if (res.dx || res.dy) node.position({ x: node.x() + res.dx, y: node.y() + res.dy });
    setGuides(res.guides);
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
          const onStage = e.target === e.target.getStage();
          if (tool === 'select') {
            if (onStage) s.setSelected([]);
            return;
          }
          getTool(tool).onDown(ctx, onStage ? 'stage' : 'element');
        }}
        onMouseMove={() => getTool(tool).onMove(ctx)}
        onMouseUp={() => getTool(tool).onUp(ctx)}
        onContextMenu={(e: KonvaEventObject<PointerEvent>) => {
          e.evt.preventDefault();
          const group = e.target.findAncestor('.element', true) as Konva.Group | undefined;
          const pointer = stageRef.current?.getPointerPosition();
          if (!group || !pointer) {
            setMenu(null);
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
        style={{ cursor: panning ? 'grab' : tool === 'select' ? 'default' : 'crosshair' }}
      >
        <Layer>
          {elements.map((element) => (
            <ElementView
              key={element.id}
              element={element}
              theme={theme}
              draggable={tool === 'select'}
              onSelect={(additive) => {
                if (tool !== 'select') return;
                s.setSelected(additive ? Array.from(new Set([...selected, element.id])) : [element.id]);
              }}
              onChange={(patch) => {
                setGuides([]);
                s.dispatch(updateElements({ [element.id]: patch }));
              }}
              onEdit={() => startEditing(element.id)}
              onDragMove={(node) => handleDragMove(node, element)}
              registerNode={(id, node) => {
                if (node) nodes.current.set(id, node);
                else nodes.current.delete(id);
              }}
            />
          ))}
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
        />
      )}

      <ZoomBar store={store} size={size} />
    </div>
  );
}
