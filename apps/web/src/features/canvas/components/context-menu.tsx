import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { CanvasElementPatch } from '@syncflow/shared';
import { addElements, removeElements, updateElements } from '../model/commands';
import { descendantIds, layoutMindMap } from '../model/mindmap';
import { explodeToNodes } from '../model/explode';
import { arrangeRow, arrangeColumn } from '../model/arrange';
import type { CanvasStore } from '../engine/canvas-store';

interface Props {
  x: number;
  y: number;
  ids: string[];
  store: CanvasStore;
  onEditText(): void;
  onClose(): void;
  /** Called when user clicks "Add comment" — receives the pinned elementId. */
  onAddComment?: (elementId: string) => void;
}

export function ContextMenu({ x, y, ids, store, onEditText, onClose, onAddComment }: Props): JSX.Element | null {
  const s = store.getState();
  const readOnly = s.readOnly;
  const locked = ids.length === 1 && !!s.doc.elements[ids[0]!]?.locked;
  const grouped = ids.some((id) => !!s.doc.elements[id]?.groupId);

  // Collapse/expand applies to a single mindnode that actually has children.
  const soleEl = ids.length === 1 ? s.doc.elements[ids[0]!] : undefined;
  const mindNodes = Object.values(s.doc.elements).filter((e) => e.type === 'mindnode');
  const hasChildren = !!soleEl && soleEl.type === 'mindnode' && descendantIds(soleEl.id, mindNodes).length > 0;

  // "Explode into nodes": shown for a single text/sticky with ≥2 non-empty lines.
  const canExplode =
    ids.length === 1 &&
    !!soleEl &&
    (soleEl.type === 'text' || soleEl.type === 'sticky') &&
    (soleEl.text ?? '').split('\n').filter((l) => l.trim().length > 0).length >= 2;

  const explodeIntoNodes = (): void => {
    if (!soleEl) return;
    const nodes = explodeToNodes(soleEl, () => crypto.randomUUID());
    if (nodes.length === 0) return;
    s.dispatch(addElements(nodes));
    // Select the new root node.
    s.setSelected([nodes[0]!.id]);
  };

  // "Arrange in row/column": shown when ≥2 elements selected.
  const canArrange = ids.length >= 2;

  const doArrangeRow = (): void => {
    const els = ids.map((id) => s.doc.elements[id]).filter((e) => !!e);
    if (els.length < 2) return;
    const patches = arrangeRow(els);
    if (Object.keys(patches).length) s.dispatch(updateElements(patches));
  };

  const doArrangeColumn = (): void => {
    const els = ids.map((id) => s.doc.elements[id]).filter((e) => !!e);
    if (els.length < 2) return;
    const patches = arrangeColumn(els);
    if (Object.keys(patches).length) s.dispatch(updateElements(patches));
  };

  const toggleCollapse = (): void => {
    if (!soleEl) return;
    const nextCollapsed = !soleEl.collapsed;
    // One undo step: flip `collapsed`, then reflow the visible tree.
    const projected = mindNodes.map((n) => (n.id === soleEl.id ? { ...n, collapsed: nextCollapsed } : n));
    const layout = layoutMindMap(projected);
    const patches: Record<string, CanvasElementPatch> = { [soleEl.id]: { collapsed: nextCollapsed } };
    for (const [id, pos] of Object.entries(layout)) {
      const existing = s.doc.elements[id];
      if (!existing) continue;
      const patch = patches[id] ?? {};
      if (existing.x !== pos.x || existing.y !== pos.y) patches[id] = { ...patch, x: pos.x, y: pos.y };
    }
    s.dispatch(updateElements(patches));
  };

  const ref = useRef<HTMLDivElement>(null);
  // Keep the whole menu on screen: opened near the right or bottom edge (a
  // long-press on a phone, a right-click by the window edge) it would
  // otherwise run past the canvas.
  const [pos, setPos] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.offsetParent;
    if (!el || !(parent instanceof HTMLElement)) return;
    const margin = 8;
    setPos({
      left: Math.max(margin, Math.min(x, parent.clientWidth - el.offsetWidth - margin)),
      top: Math.max(margin, Math.min(y, parent.clientHeight - el.offsetHeight - margin)),
    });
  }, [x, y, ids.length]);
  // Destructive: the first activation arms it, the second one clears.
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    // Close on an outside pointerdown, but ignore pointerdowns INSIDE the menu —
    // otherwise this window-level listener would tear the menu down before the
    // item's click handler runs, which makes every menu item silently do nothing.
    const onPointerDown = (e: PointerEvent): void => {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      onClose();
    };
    const onBlur = (): void => onClose();
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('blur', onBlur);
    };
  }, [onClose]);

  // Keyboard users land on the first item; focus goes back where it came from.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => {
      if (previous && previous.isConnected) previous.focus();
    };
  }, []);

  const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const index = items.indexOf(document.activeElement as HTMLElement);
    let next: number | null = null;
    if (e.key === 'ArrowDown') next = index < 0 ? 0 : (index + 1) % items.length;
    else if (e.key === 'ArrowUp') next = index <= 0 ? items.length - 1 : index - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    else if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    } else {
      // Keep canvas shortcuts (Delete, arrows-nudge, ...) away from the menu.
      if (e.key !== 'Enter' && e.key !== ' ') e.stopPropagation();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (items.length > 0 && next !== null) items[next]?.focus();
  };

  const item = (
    label: string,
    run: () => void,
    { danger = false, keepOpen = false }: { danger?: boolean; keepOpen?: boolean } = {},
  ): JSX.Element => (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      onClick={(e) => {
        e.stopPropagation();
        run();
        if (!keepOpen) onClose();
      }}
      className={`flex w-full items-center justify-between gap-6 rounded px-2.5 py-1.5 text-left text-sm hover:bg-sunken max-md:py-2.5 focus:bg-sunken focus:outline-none dark:hover:bg-sunken-dark dark:focus:bg-sunken-dark ${
        danger ? 'text-danger' : 'text-ink-600 dark:text-ink-dark'
      }`}
    >
      {label}
    </button>
  );

  const allIds = Object.keys(s.doc.elements);
  const clearCanvas = (): void => {
    if (allIds.length === 0) return;
    s.dispatch(removeElements(allIds));
    s.setSelected([]);
  };

  // Every element action edits the doc, which viewers can't; an empty popup
  // would just be noise.
  if (readOnly && ids.length > 0) return null;

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={ids.length === 0 ? 'Canvas actions' : 'Element actions'}
      onKeyDown={onMenuKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      className="absolute z-20 w-48 max-md:w-56 rounded-lg border border-line bg-raised p-1 shadow-float dark:border-line-dark dark:bg-raised-dark"
      style={pos}
    >
      {/* Empty-canvas menu: right-click on the board with nothing selected. */}
      {ids.length === 0 && allIds.length === 0 && (
        <div className="px-2.5 py-1.5 text-sm text-ink-400 dark:text-ink-dark">Empty board</div>
      )}
      {ids.length === 0 && allIds.length > 0 && item('Select all', () => s.setSelected(allIds))}
      {ids.length === 0 &&
        allIds.length > 0 &&
        !readOnly &&
        (confirmClear
          ? item('Click again to confirm', clearCanvas, { danger: true })
          : item('Clear canvas', () => setConfirmClear(true), { danger: true, keepOpen: true }))}

      {ids.length > 0 && !readOnly && (
        <>
          {ids.length === 1 && item('Edit text', onEditText)}
          {ids.length === 1 && onAddComment && item('Add comment', () => onAddComment(ids[0]!))}
          {hasChildren &&
            item(soleEl?.collapsed ? 'Expand branch' : 'Collapse branch', toggleCollapse)}
          {canExplode && item('Explode into nodes', explodeIntoNodes)}
          {canArrange && item('Arrange in row', doArrangeRow)}
          {canArrange && item('Arrange in column', doArrangeColumn)}
          {item('Duplicate', () => s.duplicate(ids))}
          {item('Bring to front', () => s.bringToFront(ids))}
          {item('Send to back', () => s.sendToBack(ids))}
          {ids.length >= 2 && !grouped && item('Group', () => s.group(ids))}
          {grouped && item('Ungroup', () => s.ungroup(ids))}
          {item(locked ? 'Unlock' : 'Lock', () => s.setLocked(ids, !locked))}
          <div role="separator" className="my-1 h-px bg-line dark:bg-line-dark" />
          {item(
            'Delete',
            () => {
              const toDelete = new Set<string>(ids);
              for (const id of ids) {
                const el = s.doc.elements[id];
                if (el?.type === 'mindnode') {
                  for (const did of descendantIds(id, mindNodes)) toDelete.add(did);
                }
              }
              // Locked means protected from edits — the keyboard delete skips them too.
              const unlocked = [...toDelete].filter((id) => !s.doc.elements[id]?.locked);
              if (unlocked.length) s.dispatch(removeElements(unlocked));
              s.setSelected([]);
            },
            { danger: true },
          )}
        </>
      )}
    </div>
  );
}
