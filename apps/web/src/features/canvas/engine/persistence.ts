import type { Theme } from '../model/colors';
import type { Doc } from '../model/commands';

const key = (boardId: string): string => `syncflow:board:${boardId}`;

export function loadBoard(boardId: string): { doc: Doc; theme: Theme } | null {
  const raw = localStorage.getItem(key(boardId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { doc: Doc; theme: Theme };
  } catch {
    return null;
  }
}

export function saveBoard(boardId: string, doc: Doc, theme: Theme): void {
  localStorage.setItem(key(boardId), JSON.stringify({ doc, theme }));
}
