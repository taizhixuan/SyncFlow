/**
 * Minimap — a fixed bottom-right overview of the whole board.
 *
 * Renders each element as a plain filled <rect> at minimap scale (cheap —
 * no Konva shapes, just an <svg>). Draws the current viewport as a stroked
 * rectangle.  Click (or drag) on the minimap recenters the main view on the
 * corresponding board point via setView.
 *
 * Read-only over the Yjs doc — this component never writes to the doc or
 * awareness.
 */

import { useCallback, useMemo, useRef } from 'react';
import { useStore } from 'zustand';
import type { CanvasElement } from '@syncflow/shared';
import type { CanvasStore } from '../engine/canvas-store';
import type { View } from '../engine/viewport';
import { resolveStroke, resolveFill } from '../model/colors';
import { getBounds } from '../model/element';
import {
  boardBounds,
  fitTransform,
  viewportRectInMini,
  miniPointToBoard,
  type MiniTransform,
} from '../model/minimap';

// ── constants ─────────────────────────────────────────────────────────────────

const MINI_W = 180;
const MINI_H = 120;
const PAD = 8;

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Compute the new View so that `boardPt` is centered in the stage.
 * Keeps the existing scale; only changes the pan.
 */
function centeredView(boardPt: { x: number; y: number }, currentView: View, stageW: number, stageH: number): View {
  return {
    scale: currentView.scale,
    x: stageW / 2 - boardPt.x * currentView.scale,
    y: stageH / 2 - boardPt.y * currentView.scale,
  };
}

// ── component ─────────────────────────────────────────────────────────────────

export interface MinimapProps {
  store: CanvasStore;
  /** Pixel dimensions of the main canvas stage (for viewport math). */
  stageSize: { width: number; height: number };
}

export function Minimap({ store, stageSize }: MinimapProps): JSX.Element {
  const doc = useStore(store, (s) => s.doc);
  const view = useStore(store, (s) => s.view);
  const theme = useStore(store, (s) => s.theme);
  const svgRef = useRef<SVGSVGElement>(null);

  const elements = useMemo(() => Object.values(doc.elements), [doc]);

  const t: MiniTransform = useMemo(() => {
    const bounds = boardBounds(elements);
    return fitTransform(bounds, { width: MINI_W, height: MINI_H }, PAD);
  }, [elements]);

  const vpRect = useMemo(
    () => viewportRectInMini(view, stageSize, t),
    [view, stageSize, t],
  );

  // ── click-to-pan ──────────────────────────────────────────────────────────

  const handlePointer = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (e.buttons === 0 && e.type !== 'click') return;
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const miniPt = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
      const boardPt = miniPointToBoard(miniPt, t);
      const newView = centeredView(boardPt, view, stageSize.width, stageSize.height);
      store.getState().setView(newView);
    },
    [t, view, stageSize, store],
  );

  // Theme-aware surface colors.
  const surfaceBg = theme === 'dark' ? '#1E1E26' : '#F8F8F8';
  const borderColor = theme === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)';
  const vpStroke = theme === 'dark' ? 'rgba(99,102,241,0.9)' : 'rgba(79,70,229,0.85)';
  const vpFill = theme === 'dark' ? 'rgba(99,102,241,0.08)' : 'rgba(79,70,229,0.06)';

  return (
    <div
      className="pointer-events-auto select-none overflow-hidden rounded-lg shadow-lg ring-1"
      style={{
        width: MINI_W,
        height: MINI_H,
        background: surfaceBg,
        outline: `1px solid ${borderColor}`,
      }}
      aria-label="Minimap overview"
    >
      <svg
        ref={svgRef}
        width={MINI_W}
        height={MINI_H}
        viewBox={`0 0 ${MINI_W} ${MINI_H}`}
        role="img"
        aria-label="Board overview. Click to pan."
        style={{ display: 'block', cursor: 'crosshair' }}
        onClick={handlePointer}
        onPointerMove={handlePointer}
      >
        {/* Element rects */}
        {elements.map((el) => (
          <ElementDot key={el.id} el={el} t={t} theme={theme} />
        ))}

        {/* Viewport rectangle */}
        <rect
          x={vpRect.x}
          y={vpRect.y}
          width={Math.max(1, vpRect.width)}
          height={Math.max(1, vpRect.height)}
          fill={vpFill}
          stroke={vpStroke}
          strokeWidth={1.5}
          rx={1}
          ry={1}
          style={{ pointerEvents: 'none' }}
        />
      </svg>
    </div>
  );
}

// ── ElementDot ────────────────────────────────────────────────────────────────

/** Renders a single element as a tiny filled rect in minimap coords. */
function ElementDot({
  el,
  t,
  theme,
}: {
  el: CanvasElement;
  t: MiniTransform;
  theme: 'light' | 'dark';
}): JSX.Element | null {
  const b = getBounds(el);
  const x = b.x * t.scale + t.offsetX;
  const y = b.y * t.scale + t.offsetY;
  const w = Math.max(1, b.width * t.scale);
  const h = Math.max(1, b.height * t.scale);

  // Skip elements with zero visible area.
  if (w < 0.5 && h < 0.5) return null;

  const fill = resolveFill(el.fill, theme) ?? (theme === 'dark' ? '#3A3A4A' : '#D0D0D8');
  const stroke = el.strokeWidth && el.strokeWidth > 0
    ? resolveStroke(el.stroke ?? 'auto', theme)
    : undefined;

  return (
    <rect
      x={x}
      y={y}
      width={w}
      height={h}
      fill={fill}
      stroke={stroke}
      strokeWidth={stroke ? 0.5 : undefined}
      rx={0.5}
      ry={0.5}
      style={{ pointerEvents: 'none' }}
    />
  );
}
