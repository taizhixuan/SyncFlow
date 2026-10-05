import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasElement } from '@syncflow/shared';
import { addElements, removeElements } from '../model/commands';
import { loadBoard, saveBoard } from './persistence';
import { createCanvasStore } from './canvas-store';

const rect = (id: string, x = 0): CanvasElement =>
  ({
    id,
    type: 'rect',
    x,
    y: 0,
    width: 10,
    height: 10,
    rotation: 0,
    opacity: 1,
    zIndex: 0,
    fill: null,
    stroke: 'auto',
    strokeWidth: 2,
  }) as CanvasElement;

const KEY = 'syncflow:board:local';

/** Make `window.localStorage` itself throw, as browsers do when site data is blocked. */
function blockStorage(): () => void {
  const own = Object.getOwnPropertyDescriptor(window, 'localStorage');
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get() {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    },
  });
  return () => {
    if (own) Object.defineProperty(window, 'localStorage', own);
    else delete (window as { localStorage?: Storage }).localStorage;
  };
}

describe('local board save failures', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('opens the local board when site data is blocked', () => {
    const restore = blockStorage();
    try {
      const store = createCanvasStore('local');
      expect(store.getState().doc.elements).toEqual({});
      expect(store.getState().components).toEqual([]);
    } finally {
      restore();
    }
  });

  it('surfaces a full quota and keeps the edit unsaved so a later write retries', () => {
    const store = createCanvasStore('local');
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    store.getState().dispatch(addElements([rect('a')]));
    expect(() => vi.advanceTimersByTime(600)).not.toThrow();
    expect(store.getState().saveError).toMatch(/couldn't save/i);
    expect(localStorage.getItem(KEY)).toBeNull();

    // Space frees up: the next flush writes the edit that failed, unprompted.
    spy.mockRestore();
    store.getState().dispose();
    expect(loadBoard('local')?.doc.elements['a']).toBeDefined();
    expect(store.getState().saveError).toBeNull();
  });

  it('surfaces a failure to save the component library', () => {
    const store = createCanvasStore('local');
    store.getState().dispatch(addElements([rect('a')]));
    store.getState().setSelected(['a']);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    expect(() => store.getState().saveSelectionAsComponent('Box')).not.toThrow();
    expect(store.getState().saveError).toMatch(/component/i);
  });

  it('dismisses the save error', () => {
    const store = createCanvasStore('local');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    store.getState().dispatch(addElements([rect('a')]));
    vi.advanceTimersByTime(600);
    store.getState().clearSaveError();
    expect(store.getState().saveError).toBeNull();
  });
});

/** What another tab's write looks like to this one: the store, then a `storage` event. */
function otherTabWrites(elements: Record<string, CanvasElement>): void {
  const newValue = JSON.stringify({ doc: { elements }, theme: 'dark' });
  localStorage.setItem(KEY, newValue);
  window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue }));
}

describe('local board open in two tabs', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("takes the other tab's save when this tab has nothing unsaved, without writing it back", () => {
    const store = createCanvasStore('local');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    otherTabWrites({ a: rect('a'), b: rect('b', 50) });
    setItem.mockClear();
    expect(Object.keys(store.getState().doc.elements).sort()).toEqual(['a', 'b']);
    vi.advanceTimersByTime(1000);
    store.getState().dispose();
    // Echoing the save back would ping-pong between the tabs forever.
    expect(setItem).not.toHaveBeenCalled();
  });

  it('keeps unsaved local edits on top of the other tab’s save, then saves the merge', () => {
    saveBoard('local', { elements: { a: rect('a') } }, 'dark');
    const store = createCanvasStore('local');
    store.getState().dispatch(addElements([rect('c', 90)]));
    store.getState().dispatch(removeElements(['a']));
    otherTabWrites({ a: rect('a', 5), b: rect('b', 50) });
    expect(Object.keys(store.getState().doc.elements).sort()).toEqual(['b', 'c']);
    vi.advanceTimersByTime(600);
    expect(Object.keys(loadBoard('local')?.doc.elements ?? {}).sort()).toEqual(['b', 'c']);
    store.getState().dispose();
  });

  it("an element changed in both tabs keeps this tab's version", () => {
    saveBoard('local', { elements: { a: rect('a') } }, 'dark');
    const store = createCanvasStore('local');
    store.getState().dispatch(addElements([rect('a', 7)]));
    otherTabWrites({ a: rect('a', 99) });
    expect(store.getState().doc.elements['a']?.x).toBe(7);
    store.getState().dispose();
  });

  it('a reload from the other tab is not undoable', () => {
    const store = createCanvasStore('local');
    otherTabWrites({ b: rect('b') });
    store.getState().undo();
    expect(store.getState().doc.elements['b']).toBeDefined();
    store.getState().dispose();
  });

  it('ignores other keys and unreadable values', () => {
    const store = createCanvasStore('local');
    store.getState().dispatch(addElements([rect('a')]));
    vi.advanceTimersByTime(600);
    window.dispatchEvent(new StorageEvent('storage', { key: 'syncflow:board:other', newValue: '{}' }));
    window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: 'not json' }));
    window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: null }));
    expect(Object.keys(store.getState().doc.elements)).toEqual(['a']);
    store.getState().dispose();
  });

  it('stops listening once disposed', () => {
    const store = createCanvasStore('local');
    store.getState().dispose();
    otherTabWrites({ b: rect('b') });
    expect(store.getState().doc.elements['b']).toBeUndefined();
  });
});
