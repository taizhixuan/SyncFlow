import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { Download } from 'lucide-react';
import type Konva from 'konva';
import type { CanvasElement } from '@syncflow/shared';
import type { CanvasStore } from '../engine/canvas-store';
import {
  boardPngDataUrl,
  selectionPngDataUrl,
  selectionBbox,
  resolveExportScale,
  withAllElementsMounted,
  EXPORT_MULTIPLIERS,
  type ExportMultiplier,
} from '../model/export-png';
import { elementsToSvg } from '../model/export-svg';
import { mindMapToOutline } from '../model/export-outline';
import { exportBoardPdf, exportSlidePdf } from '../model/export-pdf';
import { saveFile, dataUrlToBlob } from '../model/save-file';
import { orderFrames } from '../model/presentation';

interface ExportMenuProps {
  store: CanvasStore;
  getStage: () => Konva.Stage | null;
}

export function ExportMenu({ store, getStage }: ExportMenuProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Device pixels per board unit for every raster export. Independent of zoom.
  const [multiplier, setMultiplier] = useState<ExportMultiplier>(2);
  const menuRef = useRef<HTMLDivElement>(null);

  const doc = useStore(store, (s) => s.doc);
  const theme = useStore(store, (s) => s.theme);
  const selected = useStore(store, (s) => s.selected);

  const elements = Object.values(doc.elements) as CanvasElement[];
  const frames = orderFrames(elements);
  const hasMindNodes = elements.some((e) => e.type === 'mindnode');
  const selectedEls = elements.filter((e) => selected.includes(e.id));

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent): void {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setError(null);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Raster export needs every element mounted; see withAllElementsMounted.
  const rasterize = <T,>(run: () => T): Promise<T> =>
    withAllElementsMounted(store.getState().suspendCulling, run);

  async function runExport(format: string): Promise<void> {
    const stage = getStage();
    const view = store.getState().view;

    switch (format) {
      case 'png-board': {
        if (!stage) return;
        const url = await rasterize(() => boardPngDataUrl(stage, elements, view, multiplier));
        await saveFile(dataUrlToBlob(url), 'board.png', { 'image/png': ['.png'] });
        break;
      }
      case 'png-sel': {
        if (!stage) return;
        const url = await rasterize(() => selectionPngDataUrl(stage, selectedEls, view, multiplier));
        if (!url) return;
        await saveFile(dataUrlToBlob(url), 'selection.png', { 'image/png': ['.png'] });
        break;
      }
      case 'svg': {
        const svg = elementsToSvg(elements, theme);
        await saveFile(new Blob([svg], { type: 'image/svg+xml' }), 'board.svg', {
          'image/svg+xml': ['.svg'],
        });
        break;
      }
      case 'pdf': {
        if (!stage) return;
        const bbox = selectionBbox(elements);
        const size = bbox ? { w: bbox.width, h: bbox.height } : { w: stage.width(), h: stage.height() };
        const url = await rasterize(() => boardPngDataUrl(stage, elements, view, multiplier));
        const blob = await exportBoardPdf(url, size);
        await saveFile(blob, 'board.pdf', { 'application/pdf': ['.pdf'] });
        break;
      }
      case 'slide-pdf': {
        if (!stage || frames.length === 0) return;
        const framePngs = await rasterize(() =>
          frames.map((frame) => {
            const screenX = (frame.x ?? 0) * view.scale + view.x;
            const screenY = (frame.y ?? 0) * view.scale + view.y;
            const screenW = Math.max(1, (frame.width ?? 800) * view.scale);
            const screenH = Math.max(1, (frame.height ?? 600) * view.scale);
            const { pixelRatio } = resolveExportScale(multiplier, view.scale, {
              width: frame.width ?? 800,
              height: frame.height ?? 600,
            });
            const dataUrl = stage.toDataURL({
              x: screenX,
              y: screenY,
              width: screenW,
              height: screenH,
              pixelRatio,
            });
            return { dataUrl, size: { w: frame.width ?? 800, h: frame.height ?? 600 } };
          }),
        );
        const blob = await exportSlidePdf(framePngs);
        if (blob) await saveFile(blob, 'slides.pdf', { 'application/pdf': ['.pdf'] });
        break;
      }
      case 'markdown': {
        const md = mindMapToOutline(elements);
        await saveFile(new Blob([md], { type: 'text/markdown' }), 'mindmap.md', {
          'text/markdown': ['.md'],
        });
        break;
      }
      default:
        break;
    }
  }

  async function handleExport(format: string): Promise<void> {
    setOpen(false);
    setError(null);
    try {
      await runExport(format);
    } catch (err) {
      // Typical cause: an image from a host without CORS headers taints the
      // canvas and toDataURL throws a SecurityError. Say so in the menu rather
      // than leaving the click to do nothing.
      console.error('[export] failed', err);
      const tainted = err instanceof DOMException && err.name === 'SecurityError';
      setError(
        tainted
          ? 'Export failed: an image on the board blocks exporting (it comes from a site that does not allow it).'
          : 'Export failed. Please try again.',
      );
      setOpen(true);
    }
  }

  const btnBase =
    'w-full text-left rounded-md px-3 py-1.5 text-sm text-ink-600 hover:bg-sunken dark:text-ink-dark dark:hover:bg-sunken-dark disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Export board"
        aria-expanded={open}
        title="Export board"
        className="grid h-8 w-8 place-items-center rounded-md text-ink-400 hover:bg-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <Download size={17} strokeWidth={1.8} aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-lg border border-line bg-raised shadow-float dark:border-line-dark dark:bg-raised-dark">
          {error && (
            <p
              role="alert"
              className="border-b border-line px-3 py-2 text-xs text-danger dark:border-line-dark"
            >
              {error}
            </p>
          )}
          <fieldset className="border-b border-line px-3 py-2 dark:border-line-dark">
            <legend className="sr-only">Export resolution</legend>
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-400 dark:text-ink-dark">
              Resolution
            </div>
            <div className="flex gap-1">
              {EXPORT_MULTIPLIERS.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={multiplier === m}
                  onClick={() => setMultiplier(m)}
                  className={`flex-1 rounded-md px-2 py-1 text-xs font-medium ${
                    multiplier === m
                      ? 'bg-accent text-on-accent'
                      : 'text-ink-600 hover:bg-sunken dark:text-ink-dark dark:hover:bg-sunken-dark'
                  }`}
                >
                  {m}x
                </button>
              ))}
            </div>
          </fieldset>
          <div className="p-1">
            <button
              className={btnBase}
              onClick={() => void handleExport('png-board')}
            >
              PNG (board)
            </button>
            <button
              className={btnBase}
              disabled={selectedEls.length === 0}
              onClick={() => void handleExport('png-sel')}
            >
              PNG (selection)
            </button>
            <button
              className={btnBase}
              onClick={() => void handleExport('svg')}
            >
              SVG
            </button>
            <button
              className={btnBase}
              onClick={() => void handleExport('pdf')}
            >
              PDF
            </button>
            <button
              className={btnBase}
              disabled={frames.length === 0}
              onClick={() => void handleExport('slide-pdf')}
            >
              Slide PDF (frames)
            </button>
            <button
              className={btnBase}
              disabled={!hasMindNodes}
              onClick={() => void handleExport('markdown')}
            >
              Markdown outline (mind map)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
