import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { Circle, Transformer } from 'react-konva';
import { useStore } from 'zustand';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { isBoxType } from '../model/element';
import { updateElements } from '../model/commands';
import { resolveConnector } from '../model/connector';
import type { CanvasStore } from '../engine/canvas-store';

interface Props {
  store: CanvasStore;
  nodes: MutableRefObject<Map<string, Konva.Group>>;
}

export function SelectionLayer({ store, nodes }: Props): JSX.Element {
  const trRef = useRef<Konva.Transformer>(null);
  const selected = useStore(store, (s) => s.selected);
  const doc = useStore(store, (s) => s.doc);
  const view = useStore(store, (s) => s.view);
  const s = store.getState();

  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const attach = selected
      .map((id) => ({ id, node: nodes.current.get(id), el: doc.elements[id] }))
      .filter((x) => x.node && x.el && isBoxType(x.el.type) && !x.el.locked);
    tr.nodes(attach.map((x) => x.node!));
    tr.getLayer()?.batchDraw();
  }, [selected, doc, nodes]);

  // Endpoint handles for a single selected line or connector (box types use the
  // Transformer above; lines/connectors are edited by dragging their endpoints).
  const single = selected.length === 1 ? doc.elements[selected[0]!] : undefined;
  const editEndpoints =
    single && !single.locked && (single.type === 'line' || single.type === 'connector')
      ? single
      : undefined;

  const r = 6 / view.scale;
  const sw = 1.5 / view.scale;

  const renderHandle = (
    key: string,
    x: number,
    y: number,
    onMove: (nx: number, ny: number) => void,
    onEnd: (nx: number, ny: number) => void,
  ): JSX.Element => (
    <Circle
      key={key}
      x={x}
      y={y}
      radius={r}
      fill="#FFFFFF"
      stroke="#3B5BFF"
      strokeWidth={sw}
      draggable
      onMouseDown={(e: KonvaEventObject<MouseEvent>) => {
        e.cancelBubble = true;
      }}
      onDragMove={(e) => onMove(e.target.x(), e.target.y())}
      onDragEnd={(e) => onEnd(e.target.x(), e.target.y())}
    />
  );

  const handles: JSX.Element[] = [];
  if (editEndpoints && editEndpoints.type === 'line') {
    const el = editEndpoints;
    const pts = el.points ?? [0, 0, 0, 0];
    const setEnd = (i: number, nx: number, ny: number, commit: boolean): void => {
      const next = [...pts];
      next[i * 2] = nx - el.x;
      next[i * 2 + 1] = ny - el.y;
      const cmd = updateElements({ [el.id]: { points: next } });
      if (commit) s.dispatch(cmd);
      else s.applyTransient(cmd);
    };
    handles.push(
      renderHandle('line-0', el.x + (pts[0] ?? 0), el.y + (pts[1] ?? 0),
        (nx, ny) => setEnd(0, nx, ny, false), (nx, ny) => setEnd(0, nx, ny, true)),
      renderHandle('line-1', el.x + (pts[2] ?? 0), el.y + (pts[3] ?? 0),
        (nx, ny) => setEnd(1, nx, ny, false), (nx, ny) => setEnd(1, nx, ny, true)),
    );
  } else if (editEndpoints && editEndpoints.type === 'connector') {
    const el = editEndpoints;
    const ends = resolveConnector(el, doc.elements);
    const setEnd = (which: 'from' | 'to', nx: number, ny: number, commit: boolean): void => {
      const cmd = updateElements({ [el.id]: { [which]: { x: nx, y: ny } } });
      if (commit) s.dispatch(cmd);
      else s.applyTransient(cmd);
    };
    handles.push(
      renderHandle('conn-from', ends.from.x, ends.from.y,
        (nx, ny) => setEnd('from', nx, ny, false), (nx, ny) => setEnd('from', nx, ny, true)),
      renderHandle('conn-to', ends.to.x, ends.to.y,
        (nx, ny) => setEnd('to', nx, ny, false), (nx, ny) => setEnd('to', nx, ny, true)),
    );
  }

  return (
    <>
      <Transformer
        ref={trRef}
        rotateEnabled
        anchorStroke="#3B5BFF"
        anchorFill="#FFFFFF"
        borderStroke="#3B5BFF"
        boundBoxFunc={(oldB, newB) => (newB.width < 5 || newB.height < 5 ? oldB : newB)}
        onTransformEnd={() => {
          const patches: Record<
            string,
            { x: number; y: number; rotation: number; width: number; height: number }
          > = {};
          for (const id of selected) {
            const node = nodes.current.get(id);
            const el = doc.elements[id];
            if (!node || !el) continue;
            const sx = node.scaleX();
            const sy = node.scaleY();
            node.scaleX(1);
            node.scaleY(1);
            patches[id] = {
              x: node.x(),
              y: node.y(),
              rotation: node.rotation(),
              width: Math.max(5, (el.width ?? 0) * sx),
              height: Math.max(5, (el.height ?? 0) * sy),
            };
          }
          if (Object.keys(patches).length) s.dispatch(updateElements(patches));
        }}
      />
      {handles}
    </>
  );
}
