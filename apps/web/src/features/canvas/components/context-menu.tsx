import { useEffect } from 'react';
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
}

export function ContextMenu({ x, y, ids, store, onEditText, onClose }: Props): JSX.Element {
  const s = store.getState();
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
      {hasChildren && item(soleEl?.collapsed ? 'Expand branch' : 'Collapse branch', toggleCollapse)}
      {canExplode && item('Explode into nodes', explodeIntoNodes)}
      {canArrange && item('Arrange in row', doArrangeRow)}
      {canArrange && item('Arrange in column', doArrangeColumn)}
      {item('Duplicate', () => s.duplicate(ids))}
      {item('Bring to front', () => s.bringToFront(ids))}
      {item('Send to back', () => s.sendToBack(ids))}
      {ids.length >= 2 && !grouped && item('Group', () => s.group(ids))}
      {grouped && item('Ungroup', () => s.ungroup(ids))}
      {item(locked ? 'Unlock' : 'Lock', () => s.setLocked(ids, !locked))}
      <div className="my-1 h-px bg-line dark:bg-line-dark" />
      {item('Delete', () => {
        const toDelete = new Set<string>(ids);
        for (const id of ids) {
          const el = s.doc.elements[id];
          if (el?.type === 'mindnode') {
            for (const did of descendantIds(id, mindNodes)) toDelete.add(did);
          }
        }
        s.dispatch(removeElements([...toDelete]));
        s.setSelected([]);
      }, true)}
    </div>
  );
}
