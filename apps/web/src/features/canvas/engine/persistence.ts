import type { CanvasElement } from '@syncflow/shared';
import type { Theme } from '../model/colors';
import type { Doc } from '../model/commands';
import { isValidElement } from './yjs-doc';

/** localStorage key of a board's snapshot; other tabs' `storage` events carry it. */
export const boardKey = (boardId: string): string => `syncflow:board:${boardId}`;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Validate a stored board snapshot. localStorage outlives app versions and can
 * be edited by hand, so every element is validated like one arriving from a
 * peer: invalid entries are dropped (and logged) instead of crashing a render.
 */
export function parseBoard(raw: string | null): { doc: Doc; theme?: Theme } | null {
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

/**
 * Read the local board snapshot. With site data blocked even reading the
 * `localStorage` property throws a SecurityError, so the access itself sits
 * inside the try: the board then opens empty instead of failing to render.
 */
export function loadBoard(boardId: string): { doc: Doc; theme?: Theme } | null {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(boardKey(boardId));
  } catch {
    return null;
  }
  return parseBoard(raw);
}

/**
 * Write the local board snapshot. Returns false when the browser refused it
 * (quota exceeded, or site data blocked) so the caller can keep the edit
 * marked unsaved and tell the user, instead of the write failing silently.
 */
export function saveBoard(boardId: string, doc: Doc, theme: Theme): boolean {
  try {
    window.localStorage.setItem(boardKey(boardId), JSON.stringify({ doc, theme }));
    return true;
  } catch {
    return false;
  }
}
