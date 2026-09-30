import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Canvas content is drawn by Konva into <canvas>, so it has no DOM to assert
 * on. For shapes we read the page's own canvas store (board-page.tsx publishes
 * it as `window.__canvas`), i.e. the Yjs-backed doc the renderer draws from.
 * For cursors we go one step closer to the pixels and read Konva's live scene
 * graph (`window.Konva.stages`), which is exactly what was painted.
 */
export interface ElementSnapshot {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function openBoard(page: Page, boardId: string): Promise<void> {
  await page.goto(`/app/board/${boardId}`);
  await expectLive(page);
}

export function connectionStatus(page: Page): Locator {
  return page.getByRole('status', { name: /^Connection:/ });
}

export async function expectLive(page: Page): Promise<void> {
  await expect(connectionStatus(page)).toHaveAccessibleName('Connection: Live', {
    timeout: 20_000,
  });
}

export function canvas(page: Page): Locator {
  // Konva stacks one <canvas> per layer inside its container; the top one
  // receives the pointer events.
  return page.locator('.konvajs-content canvas').last();
}

/** Screen position of a point given relative to the canvas's top-left corner. */
async function canvasPoint(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  const box = await canvas(page).boundingBox();
  if (!box) throw new Error('canvas is not visible');
  return { x: box.x + x, y: box.y + y };
}

export async function pickTool(page: Page, name: RegExp): Promise<void> {
  const tools = page.getByRole('toolbar', { name: 'Drawing tools' });
  await tools.getByRole('button', { name }).click();
}

/** Drag-to-size a box shape (rectangle, ellipse, …) with the real pointer. */
export async function drawBox(
  page: Page,
  tool: RegExp,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  await pickTool(page, tool);
  const a = await canvasPoint(page, from.x, from.y);
  const b = await canvasPoint(page, to.x, to.y);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 5 });
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
}

/** Press, drag and release with the select tool (moves whatever is under `from`). */
export async function dragOnCanvas(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  const a = await canvasPoint(page, from.x, from.y);
  const b = await canvasPoint(page, to.x, to.y);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 10 });
  await page.mouse.up();
}

/** Hover the pointer across the canvas so presence publishes a cursor. */
export async function wiggleCursor(page: Page, at: { x: number; y: number }): Promise<void> {
  const p = await canvasPoint(page, at.x, at.y);
  await page.mouse.move(p.x - 20, p.y - 20);
  await page.mouse.move(p.x, p.y, { steps: 5 });
}

export async function elements(page: Page): Promise<ElementSnapshot[]> {
  return page.evaluate(() => {
    interface ElementLike {
      id: string;
      type: string;
      x: number;
      y: number;
      width?: number;
      height?: number;
    }
    const store = (
      window as unknown as {
        __canvas?: { getState(): { doc: { elements: Record<string, ElementLike> } } };
      }
    ).__canvas;
    if (!store) return [];
    return Object.values(store.getState().doc.elements).map((e) => ({
      id: e.id,
      type: e.type,
      x: e.x,
      y: e.y,
      width: e.width ?? 0,
      height: e.height ?? 0,
    }));
  });
}

export async function elementsOfType(page: Page, type: string): Promise<ElementSnapshot[]> {
  return (await elements(page)).filter((e) => e.type === type);
}

/** Text of every Konva Text node currently painted — remote cursor name tags live here. */
export async function paintedTexts(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    interface KonvaNode {
      text(): string;
      isVisible(): boolean;
    }
    const konva = (
      window as unknown as {
        Konva?: { stages: { find(selector: string): KonvaNode[] }[] };
      }
    ).Konva;
    if (!konva) return [];
    return konva.stages.flatMap((s) =>
      s
        .find('Text')
        .filter((t) => t.isVisible())
        .map((t) => t.text()),
    );
  });
}
