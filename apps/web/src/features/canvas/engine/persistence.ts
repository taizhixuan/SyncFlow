import type { CanvasElement } from '@syncflow/shared';
import type { Theme } from '../model/colors';
import type { Doc } from '../model/commands';
import { isValidElement } from './yjs-doc';

const key = (boardId: string): string => `syncflow:board:${boardId}`;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Read the local board snapshot. localStorage outlives app versions and can be
 * edited by hand, so every element is validated like one arriving from a peer:
 * invalid entries are dropped (and logged) instead of crashing the first render.
 */
export function loadBoard(boardId: string): { doc: Doc; theme?: Theme } | null {
  const raw = localStorage.getItem(key(boardId));
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || !isRecord(parsed.doc) || !isRecord(parsed.doc.elements)) return null;
  const elements: Record<string, CanvasElement> = {};
  for (const [id, el] of Object.entries(parsed.doc.elements)) {
    if (isValidElement(id, el)) elements[id] = el;
  }
  const theme = parsed.theme === 'light' || parsed.theme === 'dark' ? parsed.theme : undefined;
  return { doc: { elements }, ...(theme ? { theme } : {}) };
}

export function saveBoard(boardId: string, doc: Doc, theme: Theme): void {
  localStorage.setItem(key(boardId), JSON.stringify({ doc, theme }));
}
