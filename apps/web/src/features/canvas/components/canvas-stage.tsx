import { useLayoutEffect, useRef, useState } from 'react';
import { Layer, Stage } from 'react-konva';
import { useStore } from 'zustand';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { ElementView } from './element-view';
import { SelectionLayer } from './selection-layer';
import { ZoomBar } from './zoom-bar';
import { getTool } from '../tools/tools';
import { screenToCanvas, zoomAtPoint } from '../engine/viewport';
import { updateElements } from '../model/commands';
import type { CanvasStore } from '../engine/canvas-store';

export function CanvasStage({ store }: { store: CanvasStore }): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const nodes = useRef<Map<string, Konva.Group>>(new Map());
  const [size, setSize] = useState({ width: 800, height: 600 });

  const doc = useStore(store, (s) => s.doc);
  const view = useStore(store, (s) => s.view);
  const tool = useStore(store, (s) => s.tool);
  const theme = useStore(store, (s) => s.theme);
  const selected = useStore(store, (s) => s.selected);
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

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-paper dark:bg-paper-dark"
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
          const onStage = e.target === e.target.getStage();
          if (tool === 'select') {
            if (onStage) s.setSelected([]);
            return;
          }
          getTool(tool).onDown(ctx, onStage ? 'stage' : 'element');
        }}
        onMouseMove={() => getTool(tool).onMove(ctx)}
        onMouseUp={() => getTool(tool).onUp(ctx)}
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
              onChange={(patch) => s.dispatch(updateElements({ [element.id]: patch }))}
              registerNode={(id, node) => {
                if (node) nodes.current.set(id, node);
                else nodes.current.delete(id);
              }}
            />
          ))}
          <SelectionLayer store={store} nodes={nodes} />
        </Layer>
      </Stage>
      <ZoomBar store={store} size={size} />
    </div>
  );
}
