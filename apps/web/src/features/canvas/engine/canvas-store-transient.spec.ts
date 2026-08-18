/**
 * canvas-store-transient.spec.ts — the live-preview (transient) overlay contract.
 *
 * The store holds exactly ONE transient command and re-applies it to a freshly
 * projected base on every change. Because an in-progress shape has not been
 * written to Yjs yet, that base does not contain it — so the transient command
 * has to be able to reconstitute the whole element by itself. These tests pin
 * that down, and cover the connector regression where a live preview only
 * appeared once the gesture finished.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { CanvasElement } from '@syncflow/shared';
import { addElements, updateElements } from '../model/commands';
import { createCanvasStore } from './canvas-store';

const connector = (id: string, to: { x: number; y: number }): CanvasElement =>
  ({
    id,
    type: 'connector',
    x: 0,
    y: 0,
    rotation: 0,
    opacity: 1,
    zIndex: 0,
    fill: null,
    stroke: 'auto',
    strokeWidth: 2,
    strokeStyle: 'solid',
    from: { x: 0, y: 0 },
    to,
    endArrow: true,
  }) as CanvasElement;

describe('transient overlay', () => {
  beforeEach(() => localStorage.clear());

  it('holds only the most recent command', () => {
    const store = createCanvasStore('local');
    store.getState().applyTransient(addElements([connector('c1', { x: 10, y: 10 })]));
    expect(store.getState().doc.elements.c1).toBeDefined();

    // A second transient replaces the first rather than stacking on it.
    store.getState().applyTransient(addElements([connector('c2', { x: 5, y: 5 })]));
    expect(store.getState().doc.elements.c1).toBeUndefined();
    expect(store.getState().doc.elements.c2).toBeDefined();
  });

  it('drops a transient updateElements aimed at an uncommitted element', () => {
    // This is the shape of the connector bug: the draft lives only in the
    // transient slot, so the follow-up update has nothing in the base to patch
    // and silently resolves to nothing. Documented so the regression is visible.
    const store = createCanvasStore('local');
    store.getState().applyTransient(addElements([connector('c1', { x: 10, y: 10 })]));
    store.getState().applyTransient(updateElements({ c1: { to: { x: 99, y: 99 } } }));

    expect(store.getState().doc.elements.c1).toBeUndefined();
  });

  it('keeps the preview visible when each frame re-applies the whole draft', () => {
    // The fix: every move re-sends the complete element via addElements.
    const store = createCanvasStore('local');
    store.getState().applyTransient(addElements([connector('c1', { x: 10, y: 10 })]));
    store.getState().applyTransient(addElements([connector('c1', { x: 99, y: 99 })]));

    const live = store.getState().doc.elements.c1;
    expect(live).toBeDefined();
    expect(live?.to).toEqual({ x: 99, y: 99 });
  });

  it('clears the preview and leaves the committed element on dispatch', () => {
    const store = createCanvasStore('local');
    store.getState().applyTransient(addElements([connector('c1', { x: 10, y: 10 })]));
    store.getState().dispatch(addElements([connector('c1', { x: 42, y: 42 })]));

    const committed = store.getState().doc.elements.c1;
    expect(committed?.to).toEqual({ x: 42, y: 42 });

    // A later unrelated projection must not resurrect the stale preview.
    store.getState().applyTransient(addElements([connector('c2', { x: 1, y: 1 })]));
    expect(store.getState().doc.elements.c1?.to).toEqual({ x: 42, y: 42 });
  });
});
