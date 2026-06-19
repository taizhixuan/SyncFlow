import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { Transformer } from 'react-konva';
import { useStore } from 'zustand';
import type Konva from 'konva';
import { isBoxType } from '../model/element';
import { updateElements } from '../model/commands';
import type { CanvasStore } from '../engine/canvas-store';

interface Props {
  store: CanvasStore;
  nodes: MutableRefObject<Map<string, Konva.Group>>;
}

export function SelectionLayer({ store, nodes }: Props): JSX.Element {
  const trRef = useRef<Konva.Transformer>(null);
  const selected = useStore(store, (s) => s.selected);
  const doc = useStore(store, (s) => s.doc);
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

  return (
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
  );
}
