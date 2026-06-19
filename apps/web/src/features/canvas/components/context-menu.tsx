import { useEffect } from 'react';
import { removeElements } from '../model/commands';
import type { CanvasStore } from '../engine/canvas-store';

interface Props {
  x: number;
  y: number;
  ids: string[];
  store: CanvasStore;
  onEditText(): void;
  onClose(): void;
}

export function ContextMenu({ x, y, ids, store, onEditText, onClose }: Props): JSX.Element {
  const s = store.getState();
  const locked = ids.length === 1 && !!s.doc.elements[ids[0]!]?.locked;

  useEffect(() => {
    const close = (): void => onClose();
    window.addEventListener('pointerdown', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('blur', close);
    };
  }, [onClose]);

  const item = (label: string, run: () => void, danger = false): JSX.Element => (
    <button
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        run();
        onClose();
      }}
      className={`flex w-full items-center justify-between gap-6 rounded px-2.5 py-1.5 text-left text-sm hover:bg-sunken dark:hover:bg-sunken-dark ${
        danger ? 'text-danger' : 'text-ink-600 dark:text-ink-dark'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
      className="absolute z-20 w-48 rounded-lg border border-line bg-raised p-1 shadow-float dark:border-line-dark dark:bg-raised-dark"
      style={{ left: x, top: y }}
    >
      {ids.length === 1 && item('Edit text', onEditText)}
      {item('Duplicate', () => s.duplicate(ids))}
      {item('Bring to front', () => s.bringToFront(ids))}
      {item('Send to back', () => s.sendToBack(ids))}
      {item(locked ? 'Unlock' : 'Lock', () => s.setLocked(ids, !locked))}
      <div className="my-1 h-px bg-line dark:bg-line-dark" />
      {item('Delete', () => {
        s.dispatch(removeElements(ids));
        s.setSelected([]);
      }, true)}
    </div>
  );
}
