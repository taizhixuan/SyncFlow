import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Layer, Stage, Transformer } from 'react-konva';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { CanvasElement } from '@syncflow/shared';
import { BOX_TYPES, createDraft, type ToolId } from '../lib/tools';
import type { useCanvasDocument } from '../hooks/use-canvas-document';
import { ElementShape } from './element-shape';

interface Props {
  tool: ToolId;
  onToolChange: (tool: ToolId) => void;
  doc: ReturnType<typeof useCanvasDocument>;
  spaceDown: boolean;
  createdBy?: string;
}

interface View {
  x: number;
  y: number;
  scale: number;
}

const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));

export function CanvasStage({ tool, onToolChange, doc, spaceDown, createdBy }: Props): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const nodes = useRef<Map<string, Konva.Group>>(new Map());

  const [size, setSize] = useState({ width: 800, height: 600 });
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);

  const drawing = useRef<{
    id: string;
    type: ToolId;
    start: { x: number; y: number };
    points: number[];
    w: number;
    h: number;
  } | null>(null);

  const panning = tool === 'pan' || spaceDown;

  // Keep the stage sized to its container.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const apply = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Attach the transformer to the selected box-type element.
  useEffect(() => {
    const tr = transformerRef.current;
    if (!tr) return;
    const selected = doc.elements.find((e) => e.id === doc.selectedId);
    const node = doc.selectedId ? nodes.current.get(doc.selectedId) : undefined;
    if (selected && node && BOX_TYPES.includes(selected.type)) {
      tr.nodes([node]);
    } else {
      tr.nodes([]);
    }
    tr.getLayer()?.batchDraw();
  }, [doc.selectedId, doc.elements]);

  function relativePoint(): { x: number; y: number } {
    const stage = stageRef.current!;
    const p = stage.getRelativePointerPosition();
    return { x: p?.x ?? 0, y: p?.y ?? 0 };
  }

  function handleMouseDown(e: KonvaEventObject<MouseEvent>): void {
    if (panning) return; // stage handles the drag
    const clickedEmpty = e.target === e.target.getStage();

    if (tool === 'select') {
      if (clickedEmpty) doc.setSelectedId(null);
      return;
    }
    if (!clickedEmpty) return; // only start drawing from empty canvas

    const start = relativePoint();
    const element = createDraft(tool, start, doc.nextZIndex, createdBy);
    doc.add(element);

    if (tool === 'sticky' || tool === 'text') {
      doc.setSelectedId(element.id);
      onToolChange('select');
      if (tool === 'text') setEditing({ id: element.id, value: element.text ?? '' });
      return;
    }
    drawing.current = {
      id: element.id,
      type: tool,
      start,
      points: element.points ? [...element.points] : [],
      w: 0,
      h: 0,
    };
  }

  function handleMouseMove(): void {
    const draft = drawing.current;
    if (!draft) return;
    const p = relativePoint();

    if (draft.type === 'rect' || draft.type === 'ellipse') {
      draft.w = Math.abs(p.x - draft.start.x);
      draft.h = Math.abs(p.y - draft.start.y);
      doc.update(draft.id, {
        x: Math.min(draft.start.x, p.x),
        y: Math.min(draft.start.y, p.y),
        width: draft.w,
        height: draft.h,
      });
    } else if (draft.type === 'line') {
      doc.update(draft.id, { points: [0, 0, p.x - draft.start.x, p.y - draft.start.y] });
    } else if (draft.type === 'freehand') {
      draft.points.push(p.x - draft.start.x, p.y - draft.start.y);
      doc.update(draft.id, { points: [...draft.points] });
    }
  }

  function handleMouseUp(): void {
    const draft = drawing.current;
    drawing.current = null;
    if (!draft) return;

    // Use the draft size tracked in the ref — reading back from doc.elements here
    // would be a stale closure (no re-render happens during a fast drag).
    const tooSmall = (draft.type === 'rect' || draft.type === 'ellipse') && (draft.w < 4 || draft.h < 4);
    if (tooSmall) {
      doc.remove([draft.id]);
    } else {
      doc.setSelectedId(draft.id);
    }
    onToolChange('select');
  }

  function handleWheel(e: KonvaEventObject<WheelEvent>): void {
    e.evt.preventDefault();
    const stage = stageRef.current!;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const oldScale = view.scale;
    const mousePointTo = { x: (pointer.x - view.x) / oldScale, y: (pointer.y - view.y) / oldScale };
    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const newScale = clamp(oldScale * (1 + direction * 0.1), 0.2, 4);
    setView({
      scale: newScale,
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  }

  function commitEdit(): void {
    if (editing) doc.update(editing.id, { text: editing.value });
    setEditing(null);
  }

  function zoomBy(factor: number): void {
    const center = { x: size.width / 2, y: size.height / 2 };
    const oldScale = view.scale;
    const newScale = clamp(oldScale * factor, 0.2, 4);
    const point = { x: (center.x - view.x) / oldScale, y: (center.y - view.y) / oldScale };
    setView({ scale: newScale, x: center.x - point.x * newScale, y: center.y - point.y * newScale });
  }

  const editingElement = editing ? doc.elements.find((e) => e.id === editing.id) : undefined;

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-paper">
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        x={view.x}
        y={view.y}
        scaleX={view.scale}
        scaleY={view.scale}
        draggable={panning}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onDragEnd={(e) => {
          if (e.target === stageRef.current) {
            setView((v) => ({ ...v, x: e.target.x(), y: e.target.y() }));
          }
        }}
        style={{ cursor: panning ? 'grab' : tool === 'select' ? 'default' : 'crosshair' }}
      >
        <Layer>
          {doc.elements.map((element: CanvasElement) => (
            <ElementShape
              key={element.id}
              element={element}
              draggable={tool === 'select' && !spaceDown}
              onSelect={() => {
                if (tool === 'select') doc.setSelectedId(element.id);
              }}
              onChange={(patch) => doc.update(element.id, patch)}
              onEditText={() => setEditing({ id: element.id, value: element.text ?? '' })}
              registerNode={(id, node) => {
                if (node) nodes.current.set(id, node);
                else nodes.current.delete(id);
              }}
            />
          ))}
          <Transformer
            ref={transformerRef}
            rotateEnabled
            anchorStroke="#3B5BFF"
            anchorFill="#FFFFFF"
            borderStroke="#3B5BFF"
            boundBoxFunc={(oldBox, newBox) => (newBox.width < 5 || newBox.height < 5 ? oldBox : newBox)}
          />
        </Layer>
      </Stage>

      {/* Inline text editor overlay. */}
      {editing && editingElement && (
        <textarea
          autoFocus
          value={editing.value}
          onChange={(e) => setEditing({ id: editing.id, value: e.target.value })}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setEditing(null);
            if (e.key === 'Enter' && editingElement.type === 'text') {
              e.preventDefault();
              commitEdit();
            }
          }}
          className="absolute z-10 resize-none rounded-md border border-brand bg-raised p-2 text-ink shadow-float outline-none"
          style={{
            left: view.x + editingElement.x * view.scale,
            top: view.y + editingElement.y * view.scale,
            width: (editingElement.width ?? 200) * view.scale,
            minHeight: 28,
            fontSize: (editingElement.fontSize ?? 18) * view.scale,
            fontFamily: 'Inter, sans-serif',
          }}
        />
      )}

      {/* Zoom controls. */}
      <div className="absolute bottom-4 left-4 flex items-center gap-1 rounded-md border border-line bg-raised p-1 shadow-raised">
        <button
          onClick={() => zoomBy(1 / 1.2)}
          aria-label="Zoom out"
          className="h-7 w-7 rounded text-ink-600 hover:bg-sunken"
        >
          −
        </button>
        <span className="w-12 text-center font-mono text-xs text-ink-600">
          {Math.round(view.scale * 100)}%
        </span>
        <button
          onClick={() => zoomBy(1.2)}
          aria-label="Zoom in"
          className="h-7 w-7 rounded text-ink-600 hover:bg-sunken"
        >
          +
        </button>
      </div>
    </div>
  );
}
