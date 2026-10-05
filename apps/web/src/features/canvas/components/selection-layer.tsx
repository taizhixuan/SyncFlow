import { Fragment, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { Circle, Label, Rect, Tag, Text, Transformer } from 'react-konva';
import { useStore } from 'zustand';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { getBounds, isBoxType, type Rect as Bounds } from '../model/element';
import { updateElements } from '../model/commands';
import { resolveConnector } from '../model/connector';
import { readableInk, resolveSelectionColor } from '../model/colors';
import { membersOf, selectedGroups } from '../model/group';
import type { CanvasStore } from '../engine/canvas-store';

interface Props {
  store: CanvasStore;
  nodes: MutableRefObject<Map<string, Konva.Group>>;
  /**
   * Changes when a selected element's Konva node mounts or unmounts. `nodes` is
   * a ref, so it cannot trigger this component on its own; without this the
   * Transformer would keep whatever targets it resolved before viewport culling
   * mounted the rest of the selection.
   */
  nodesVersion: number;
  /** The element whose text is being edited: its resize handles would sit on the field. */
  editingId?: string;
}

export function SelectionLayer({ store, nodes, nodesVersion, editingId }: Props): JSX.Element {
  const trRef = useRef<Konva.Transformer>(null);
  // The frame scheduled to publish the mid-resize link preview, if pending.
  const previewFrame = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (previewFrame.current !== null) cancelAnimationFrame(previewFrame.current);
    },
    [],
  );
  const selected = useStore(store, (s) => s.selected);
  const doc = useStore(store, (s) => s.doc);
  const view = useStore(store, (s) => s.view);
  const readOnly = useStore(store, (s) => s.readOnly);
  const tool = useStore(store, (s) => s.tool);
  const accent = resolveSelectionColor(useStore(store, (s) => s.theme));
  const votingMode = useStore(store, (s) => s.votingMode);
  const s = store.getState();

  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const attach = selected
      .map((id) => ({ id, node: nodes.current.get(id), el: doc.elements[id] }))
      .filter((x) => x.node && x.el && isBoxType(x.el.type) && !x.el.locked && x.id !== editingId);
    tr.nodes(attach.map((x) => x.node!));
    // The Transformer caches its box and only re-measures when a node's own
    // attrs change, not when a child does. A resize resets the node's scale to 1
    // before React re-renders the shape at its new size, so without this the box
    // stays at the old size (also after an inspector or remote size edit).
    tr.getLayer()?.batchDraw();
    // The shapes re-render in a later pass, so measure on the next frame.
    const raf = requestAnimationFrame(() => {
      tr.forceUpdate();
      tr.getLayer()?.batchDraw();
    });
    return () => cancelAnimationFrame(raf);
  }, [selected, doc, nodes, nodesVersion, editingId]);

  // Endpoint handles for a single selected line or connector (box types use the
  // Transformer above; lines/connectors are edited by dragging their endpoints).
  // The handles are edits, so they follow the same gate as dragging an element:
  // a viewer, a non-select tool or voting mode must not be able to move them.
  const canEdit = !readOnly && tool === 'select' && !votingMode;
  const single = selected.length === 1 ? doc.elements[selected[0]!] : undefined;
  const editEndpoints =
    canEdit && single && !single.locked && (single.type === 'line' || single.type === 'connector')
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
      stroke={accent}
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

  // Group frames. Konva moves nodes directly during a drag or transform and
  // only commits to the doc on release, so frames are measured from the live
  // nodes and repositioned imperatively on every drag/transform event; doc
  // bounds are only the fallback for members that have no mounted node.
  const groups = selectedGroups(selected, doc.elements);
  // One selected group: the Transformer already draws its box, so a dashed
  // frame on top would just double the outline. Tag it instead. Frames are for
  // telling several groups (or the enclosing group) apart.
  const frameWhole = groups.filter((g) => !g.context).length > 1;
  const frameRefs = useRef(new Map<string, { rect: Konva.Rect | null; label: Konva.Label | null }>());
  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  const scaleRef = useRef(view.scale);
  scaleRef.current = view.scale;
  const frameWholeRef = useRef(frameWhole);
  frameWholeRef.current = frameWhole;

  const live = useRef({ elements: doc.elements });
  live.current.elements = doc.elements;

  const placeFrames = useCallback((): void => {
    const sc = scaleRef.current;
    const pad = 8 / sc;
    for (const g of groupsRef.current) {
      const refs = frameRefs.current.get(g.groupId);
      if (!refs) continue;
      let b: Bounds | null = null;
      for (const id of membersOf(g.groupId, live.current.elements)) {
        const node = nodes.current.get(id);
        const el = live.current.elements[id];
        const r = node?.getLayer()
          ? node.getClientRect({ relativeTo: node.getLayer()!, skipShadow: true })
          : el
            ? getBounds(el)
            : null;
        if (!r) continue;
        if (!b) b = { x: r.x, y: r.y, width: r.width, height: r.height };
        else {
          const x = Math.min(b.x, r.x);
          const y = Math.min(b.y, r.y);
          b = { x, y, width: Math.max(b.x + b.width, r.x + r.width) - x, height: Math.max(b.y + b.height, r.y + r.height) - y };
        }
      }
      if (!b) continue;
      const framed = g.context || frameWholeRef.current;
      refs.rect?.setAttrs({ x: b.x - pad, y: b.y - pad, width: b.width + pad * 2, height: b.height + pad * 2 });
      refs.label?.setAttrs(
        framed ? { x: b.x - pad, y: b.y - pad - 22 / sc } : { x: b.x, y: b.y - 30 / sc },
      );
    }
    trRef.current?.getLayer()?.batchDraw();
  }, [nodes]);

  useLayoutEffect(() => {
    placeFrames();
    const stage = trRef.current?.getStage();
    const tr = trRef.current;
    if (!stage || groups.length === 0) return;
    stage.on('dragmove.groupframes', placeFrames);
    tr?.on('transform.groupframes', placeFrames);
    return () => {
      stage.off('dragmove.groupframes');
      tr?.off('transform.groupframes');
    };
  });

  const groupFrames = groups.map((g) => {
    const framed = g.context || frameWhole;
    return (
      <Fragment key={`group-${g.groupId}`}>
        {framed && (
          <Rect
            ref={(r) => {
              const cur = frameRefs.current.get(g.groupId) ?? { rect: null, label: null };
              frameRefs.current.set(g.groupId, { ...cur, rect: r });
            }}
            stroke={accent}
            strokeWidth={1.25 / view.scale}
            dash={[6 / view.scale, 4 / view.scale]}
            cornerRadius={6 / view.scale}
            opacity={g.context ? 0.45 : 1}
            listening={false}
          />
        )}
        {!g.context && (
          <Label
            ref={(l) => {
              const cur = frameRefs.current.get(g.groupId) ?? { rect: null, label: null };
              frameRefs.current.set(g.groupId, { ...cur, label: l });
            }}
            scaleX={1 / view.scale}
            scaleY={1 / view.scale}
            listening={false}
          >
            <Tag fill={accent} cornerRadius={4} />
            <Text
              text={`${g.depth > 0 ? 'Nested group' : 'Group'} · ${g.size}`}
              fill={readableInk(accent)}
              fontSize={11}
              fontStyle="bold"
              fontFamily="Instrument Sans, sans-serif"
              padding={4}
            />
          </Label>
        )}
      </Fragment>
    );
  });

  return (
    <>
      {groupFrames}
      <Transformer
        ref={trRef}
        rotateEnabled={!readOnly}
        resizeEnabled={!readOnly}
        anchorStroke={accent}
        anchorFill="#FFFFFF"
        borderStroke={accent}
        boundBoxFunc={(oldB, newB) => (newB.width < 5 || newB.height < 5 ? oldB : newB)}
        onTransform={() => {
          // The Transformer only scales the Konva nodes; arrows and mind-map
          // links are drawn from the model, so hand them the in-progress sizes
          // (once per frame) instead of leaving them on the old ones until release.
          if (previewFrame.current !== null) return;
          previewFrame.current = requestAnimationFrame(() => {
            previewFrame.current = null;
            const { doc: current, selected: ids } = store.getState();
            const preview: Record<string, { x: number; y: number; rotation: number; width: number; height: number }> = {};
            for (const id of ids) {
              const node = nodes.current.get(id);
              const el = current.elements[id];
              if (!node || !el) continue;
              preview[id] = {
                x: node.x(),
                y: node.y(),
                rotation: node.rotation(),
                width: Math.max(5, (el.width ?? 0) * node.scaleX()),
                height: Math.max(5, (el.height ?? 0) * node.scaleY()),
              };
            }
            s.setLinkPreview(preview);
          });
        }}
        onTransformEnd={() => {
          if (previewFrame.current !== null) cancelAnimationFrame(previewFrame.current);
          previewFrame.current = null;
          s.setLinkPreview(null);
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
