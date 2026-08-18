/**
 * Device-pixel-ratio policy for the Konva stage.
 *
 * Konva already sizes each layer's backing store to `logicalSize * pixelRatio`
 * and applies a matching `ctx.scale(pr, pr)`, so all drawing code stays in
 * logical units. What it does NOT do is react to the ratio changing: its
 * `Konva.pixelRatio` global is a snapshot of `window.devicePixelRatio` taken
 * when the library module is first evaluated (konva/lib/Global.js), and every
 * layer canvas reads it once at construction.
 *
 * That snapshot goes stale whenever the ratio changes at runtime — browser
 * zoom, dragging the window between a 1x and a 2x monitor, an OS display-scale
 * change. The DOM chrome around the canvas re-renders crisply at the new ratio
 * while the canvas keeps its old backing store and gets upscaled by the
 * compositor, which is what reads as "the canvas is blurry but the text isn't".
 *
 * This module owns the policy (how large a backing store we are willing to
 * allocate) and the mechanism (pushing a new ratio into a live stage).
 */

// Imported from `konva/lib/Global` rather than the `konva` package root: the
// root resolves to a Node build that hard-requires the native `canvas` module,
// which is neither installed nor wanted here. Global holds the one Konva
// singleton the rest of the library (and react-konva) reads, so setting
// `pixelRatio` on it reaches every canvas constructed afterwards.
import { Konva } from 'konva/lib/Global';
import type KonvaTypes from 'konva';

/**
 * Ceiling on the ratio we will render at. Past 3x the extra samples stop being
 * distinguishable while cost grows with the square of the ratio.
 */
export const DEFAULT_MAX_DPR = 3;

/**
 * Supersampling floor: render at least this many device pixels per CSS pixel,
 * even when the display asks for fewer.
 *
 * Matching `devicePixelRatio` exactly is only "not wrong" — it is not sharp.
 * Fractional-scaled Windows displays commonly report something like 1.425, and
 * at that ratio Konva's own anti-aliasing has barely more than one sample per
 * output pixel to work with, so strokes and glyph stems land half-way across a
 * device pixel and read as soft next to DOM text (which the font rasteriser
 * hints onto the pixel grid instead). Rendering above the display ratio and
 * letting the compositor downscale is plain supersampling: more samples per
 * output pixel, cleaner edges. The cost is quadratic, which is what the budget
 * below is for.
 */
export const MIN_RENDER_DPR = 2;

/**
 * Total device pixels we are willing to allocate across ALL layers combined.
 *
 * The stage is not one canvas: mind edges, elements, laser, comments, votes and
 * remote cursors are separate full-viewport canvases. Supersampling multiplies
 * that, so the budget is what stops a large viewport from turning a quality
 * gain into a few hundred MB of backing store. It only ever claws back the
 * supersampling bonus — never the display's own ratio (see clampDpr).
 */
export const DEFAULT_PIXEL_BUDGET = 48_000_000;

/** Assumed layer count when a live stage is not available to count them. */
export const DEFAULT_LAYER_COUNT = 6;

/** Ratio difference below which re-allocating the backing store isn't worth it. */
export const DPR_EPSILON = 0.01;

export interface Size {
  width: number;
  height: number;
}

export interface DprOptions {
  /** Hard ceiling on the returned ratio. */
  maxDpr?: number;
  /** Supersampling floor — render at least this ratio if the budget allows. */
  minDpr?: number;
  /** Total device-pixel budget across every layer. */
  pixelBudget?: number;
  /** Number of full-viewport layer canvases the stage allocates. */
  layers?: number;
}

/** `window.devicePixelRatio`, defensively defaulted for jsdom/SSR. */
export function readDevicePixelRatio(): number {
  if (typeof window === 'undefined') return 1;
  const raw = window.devicePixelRatio;
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}

/**
 * Resolve the ratio to actually render at.
 *
 * Three inputs, in priority order:
 *  1. `floor` — the display's own ratio, capped. Rendering below this is the
 *     one genuinely wrong answer: the compositor would have to upscale, which
 *     is the stale-backing-store blur this whole module exists to prevent. The
 *     budget is never allowed to push us under it.
 *  2. `wanted` — the floor raised to `minDpr` for supersampling, capped.
 *  3. `affordable` — what the backing-store budget permits. Cost scales with
 *     the square of the ratio, hence the sqrt when solving for it.
 *
 * Deliberately NOT quantised. Rounding 1.4249999 to 1.42 leaves a 1293px-wide
 * canvas backing 1836 pixels where the display has 1842 — a 0.35% rescale that
 * resamples, and therefore softens, every pixel on the canvas. Exactness here
 * matters more than tidy numbers; re-allocation churn is handled by comparing
 * with an epsilon in applyStagePixelRatio instead.
 */
export function clampDpr(raw: number, size: Size, opts: DprOptions = {}): number {
  const maxDpr = opts.maxDpr ?? DEFAULT_MAX_DPR;
  const minDpr = opts.minDpr ?? MIN_RENDER_DPR;
  const budget = opts.pixelBudget ?? DEFAULT_PIXEL_BUDGET;
  const layers = Math.max(1, opts.layers ?? DEFAULT_LAYER_COUNT);

  const device = Number.isFinite(raw) && raw > 0 ? raw : 1;
  const floor = Math.min(device, maxDpr);
  const wanted = Math.min(Math.max(device, minDpr), maxDpr);

  const logicalPixels = Math.max(1, size.width) * Math.max(1, size.height) * layers;
  const affordable = Math.sqrt(budget / logicalPixels);

  return Math.max(1, floor, Math.min(wanted, affordable));
}

/**
 * Push `dpr` into every layer of a live stage and repaint.
 *
 * Konva's `Canvas.setPixelRatio` re-runs `setSize` with the same logical
 * dimensions, which reassigns `canvas.width`/`canvas.height` (resetting the 2D
 * context transform) and re-applies `ctx.scale(pr, pr)` — so the logical-unit
 * contract is preserved and the transform is not compounded.
 *
 * Hit canvases are deliberately left alone: Konva pins them to ratio 1, and
 * pointer coordinates are read in logical units, so raising them would only
 * cost memory. Returns true when a change was actually applied.
 */
export function applyStagePixelRatio(stage: KonvaTypes.Stage, dpr: number): boolean {
  // Newly-mounted layers read the global at construction, so keep it in sync or
  // a layer added later (the laser layer, say) would be built at the old ratio.
  Konva.pixelRatio = dpr;

  let changed = false;
  for (const layer of stage.getLayers()) {
    const canvas = layer.getCanvas();
    // Epsilon rather than equality: reallocating five full-viewport canvases to
    // chase a ratio change too small to see is pure cost.
    if (Math.abs(canvas.getPixelRatio() - dpr) < DPR_EPSILON) continue;
    canvas.setPixelRatio(dpr);
    changed = true;
  }
  if (changed) stage.batchDraw();
  return changed;
}

/**
 * Nudge a screen-space coordinate so a hairline centred on it covers whole
 * device pixels instead of straddling two and being anti-aliased into a wider,
 * greyer band.
 *
 * `strokeWidth` for these lines is authored as `1 / view.scale` in canvas units,
 * so after the zoom transform it is exactly 1 logical pixel — `dpr` device
 * pixels wide. A run of `dpr` pixels is aligned when its leading edge, not its
 * centre, sits on an integer, which is why the classic "add 0.5" only holds at
 * dpr 1: at dpr 2 the centre wants to be on the integer instead.
 *
 * Only worth applying to marks that are already at a quantised position. Snap
 * something that tracks the pointer (the marquee) or hugs a shape (selection
 * handles) and it visibly detaches from the thing it belongs to; a snap guide
 * is already pinned to a discrete alignment edge, so the nudge is invisible.
 */
export function snapHairlineScreen(screen: number, dpr: number): number {
  if (!Number.isFinite(screen) || !Number.isFinite(dpr) || dpr <= 0) return screen;
  const halfWidth = dpr / 2;
  const device = screen * dpr;
  return (Math.round(device - halfWidth) + halfWidth) / dpr;
}

/**
 * Seed `Konva.pixelRatio` before any stage is constructed.
 *
 * Runs on import (this module is imported by the stage component, so it is
 * evaluated first) so the very first allocation is already at the render ratio
 * rather than at Konva's stale module-load snapshot. The mounted stage refines
 * it once the real viewport size — and therefore the real budget — is known.
 */
if (typeof window !== 'undefined') {
  Konva.pixelRatio = Math.max(
    1,
    Math.min(Math.max(readDevicePixelRatio(), MIN_RENDER_DPR), DEFAULT_MAX_DPR),
  );
}
