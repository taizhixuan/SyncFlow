import { beforeEach, describe, expect, it } from 'vitest';
import { createCanvasStore } from './canvas-store';

describe('canvas store — culling suspension', () => {
  beforeEach(() => localStorage.clear());

  it('starts with culling active', () => {
    expect(createCanvasStore('local').getState().cullingSuspended).toBe(false);
  });

  it('suspends until every holder restores (nestable)', () => {
    const store = createCanvasStore('local');
    const restoreA = store.getState().suspendCulling();
    const restoreB = store.getState().suspendCulling();
    expect(store.getState().cullingSuspended).toBe(true);
    restoreA();
    expect(store.getState().cullingSuspended).toBe(true);
    restoreB();
    expect(store.getState().cullingSuspended).toBe(false);
  });

  it('a restore fn called twice only releases its own hold', () => {
    const store = createCanvasStore('local');
    const restoreA = store.getState().suspendCulling();
    const restoreB = store.getState().suspendCulling();
    restoreA();
    restoreA();
    expect(store.getState().cullingSuspended).toBe(true);
    restoreB();
    expect(store.getState().cullingSuspended).toBe(false);
  });

  it('works for viewers too — exporting is not an edit', () => {
    const store = createCanvasStore('local');
    store.getState().setReadOnly(true);
    const restore = store.getState().suspendCulling();
    expect(store.getState().cullingSuspended).toBe(true);
    restore();
  });
});
