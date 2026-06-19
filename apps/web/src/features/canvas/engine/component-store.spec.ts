import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { addComponent, loadComponents, removeComponent } from './component-store';
import type { SavedComponent } from '../model/component-lib';

function makeComp(id: string, name: string): SavedComponent {
  return { id, name, elements: [], createdAt: 0 };
}

describe('addComponent', () => {
  it('appends a component to an empty list', () => {
    const result = addComponent([], makeComp('c1', 'Foo'));
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('c1');
  });

  it('appends to an existing list without mutating', () => {
    const existing = [makeComp('c1', 'Foo')];
    const result = addComponent(existing, makeComp('c2', 'Bar'));
    expect(result).toHaveLength(2);
    expect(existing).toHaveLength(1); // original not mutated
    expect(result[1]?.id).toBe('c2');
  });
});

describe('removeComponent', () => {
  it('removes by id', () => {
    const list = [makeComp('c1', 'Foo'), makeComp('c2', 'Bar')];
    const result = removeComponent(list, 'c1');
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('c2');
  });

  it('returns same list (by length) when id not found', () => {
    const list = [makeComp('c1', 'Foo')];
    const result = removeComponent(list, 'nonexistent');
    expect(result).toHaveLength(1);
  });

  it('does not mutate the original list', () => {
    const list = [makeComp('c1', 'Foo'), makeComp('c2', 'Bar')];
    removeComponent(list, 'c1');
    expect(list).toHaveLength(2);
  });
});

// ── loadComponents validation ─────────────────────────────────────────────────

const STORAGE_KEY = 'syncflow:component-library';

describe('loadComponents — defensive validation', () => {
  // Stub localStorage for Node/jsdom environments
  const store: Record<string, string> = {};
  const localStorageMock = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => { store[key] = val; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { for (const k in store) delete store[k]; },
  };

  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: localStorageMock,
      configurable: true,
      writable: true,
    });
    localStorageMock.clear();
  });

  afterEach(() => {
    localStorageMock.clear();
  });

  it('returns [] for corrupt (non-JSON) localStorage content without throwing', () => {
    localStorage.setItem(STORAGE_KEY, '%%%not valid json%%%');
    expect(() => loadComponents()).not.toThrow();
    expect(loadComponents()).toEqual([]);
  });

  it('returns [] when stored value is a JSON non-array (object)', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: 'c1', name: 'Foo' }));
    expect(loadComponents()).toEqual([]);
  });

  it('drops entries missing required fields', () => {
    const bad1 = { name: 'NoId', elements: [], createdAt: 1 };            // missing id
    const bad2 = { id: 'x', elements: [], createdAt: 1 };                  // missing name
    const bad3 = { id: 'y', name: 'NoElements', createdAt: 1 };           // missing elements
    const bad4 = { id: 'z', name: 'NoDate', elements: [] };               // missing createdAt
    const good = makeComp('c1', 'Valid');
    localStorage.setItem(STORAGE_KEY, JSON.stringify([bad1, bad2, bad3, bad4, good]));
    const result = loadComponents();
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('c1');
  });

  it('drops entries where elements is not an array', () => {
    const bad = { id: 'x', name: 'Bad', elements: 'not-an-array', createdAt: 0 };
    const good = makeComp('c2', 'Good');
    localStorage.setItem(STORAGE_KEY, JSON.stringify([bad, good]));
    const result = loadComponents();
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('c2');
  });

  it('returns all valid entries when array is well-formed', () => {
    const comps = [makeComp('c1', 'A'), makeComp('c2', 'B')];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(comps));
    const result = loadComponents();
    expect(result).toHaveLength(2);
  });
});
