# Design — Image tool + Excalidraw-style marquee selection

> Date: 2026-06-20 · Scope: `apps/web` canvas feature · Tier: Standout polish
> Status: Approved (design), pending implementation.

## Problem

Two canvas capabilities are *implemented but not exposed*, so users can't reach them:

1. **Image upload.** The backend presigned-PUT flow (`apps/api/src/storage/`) and the
   client `uploadImage()` + `addImageFromFile()` (with S3 → data-URL fallback) already
   work. But images can only be added via **Ctrl+V paste** or **drag-drop a file** — there
   is no toolbar button and no `image` entry in the tool registry, so the feature is
   invisible. The roadmap marked it "done" (backend was), but the UI affordance was never
   added.

2. **Free cursor (marquee) selection.** `elementsInMarquee()` exists and is unit-tested,
   but `canvas-stage.tsx` never calls it. With the select tool, mousedown on empty canvas
   just *clears* the selection — there is no rubber-band box. Multi-select today is only
   shift+click per element.

Both are last-mile wiring, not greenfield.

## Decisions (from brainstorming)

- Image tool UX: **picker → click to place**.
- Marquee semantics: **touch / intersect** (Excalidraw behavior).
- Include now: **shift+drag adds to selection**, **keyboard shortcuts**, **live "N selected" badge**.

## Part A — Image tool

- Add `'image'` to the `ToolId` union (`engine/canvas-store.ts`).
- Add a no-op "special" entry for `image` in `tools/tools.ts` (like `connector`/`laser`):
  `getTool('image')` must resolve; the real behavior lives in the stage where DOM +
  stage coordinates are available.
- Add an Image button to `tool-rail.tsx` (glyph `🖼`, shortcut **I**) and `i: 'image'` to
  the keyboard shortcut map in `hooks/use-canvas-keyboard.ts`.
- Behavior in `canvas-stage.tsx`:
  - A hidden `<input type="file" accept="image/*">` lives in the container.
  - When `tool` becomes `'image'` and no file is pending, programmatically open the picker.
  - On file chosen: hold the `File` in a ref, keep the tool on `'image'` (crosshair cursor).
  - On the next stage mousedown while a file is pending: call the existing
    `addImageFromFile(file, point)` at the click point, clear the pending file, and revert
    to `select`.
  - On picker cancel (`cancel` event): revert to `select`.
- Existing paste/drag-drop paths are untouched.

## Part B — Marquee selection

Replace the "mousedown on empty stage → clear selection" branch with a rubber-band box,
active only when `tool === 'select'`:

- **mousedown on empty stage:** record start point (canvas coords), whether Shift is held
  (additive), and the selection at gesture start (the additive base). Begin a marquee.
- **mousemove:** compute the normalized rect from start→current; find hits with
  `elementsInMarquee(elements, rect)`; update selection live via
  `mergeMarquee(base, hits, additive)`. Track hit count for the badge.
- **mouseup:** finalize (selection already live), clear marquee state. If the gesture was a
  plain click (start ≈ end, < ~3px) and not additive, clear the selection (preserves the
  old click-empty-to-deselect behavior).
- **Esc:** cancel an in-progress marquee and restore the base selection.
- Rendering: a dashed blue Konva `Rect` (semi-transparent fill, stroke `1/scale`) inside the
  main layer; an absolutely-positioned HTML "N selected" badge near the cursor while dragging.

After release, no further work is needed — move/resize/delete/copy/align/group/context-menu
already operate on `selected`. The marquee just feeds the existing selection machinery.

### New pure helpers (in `model/selection.ts`, unit-tested)

- `marqueeRect(start, current): Rect` — normalize two points into a positive-size rect.
- `mergeMarquee(base, hits, additive): string[]` — additive ? union(base, hits) : hits
  (order-stable, de-duplicated).

`elementsInMarquee` is already covered.

### Known gap (documented, not silently dropped)

`getBounds()` returns a **zero-size rect for connectors/free arrows** (they use `from`/`to`,
not `points`/`width`). The marquee therefore selects box, line, and freehand elements but
**not connectors**. Connectors remain selectable by click / shift-click. Including them would
require resolving connector endpoints into bounds — deferred as a follow-up.

## Testing

- Vitest (web): `marqueeRect`, `mergeMarquee`, and a test that the `image` tool resolves via
  `getTool`. `elementsInMarquee` already covered.
- DOM/Konva gestures (file picker, drag-box) are integration-level; the two-context
  Playwright e2e is already a tracked backlog item (roadmap D) and is out of scope here.

## Files touched

- `apps/web/src/features/canvas/engine/canvas-store.ts` — `ToolId` += `'image'`.
- `apps/web/src/features/canvas/tools/tools.ts` (+ `tools.spec.ts`).
- `apps/web/src/features/canvas/components/tool-rail.tsx`.
- `apps/web/src/features/canvas/hooks/use-canvas-keyboard.ts`.
- `apps/web/src/features/canvas/model/selection.ts` (+ `selection.spec.ts`).
- `apps/web/src/features/canvas/components/canvas-stage.tsx`.
