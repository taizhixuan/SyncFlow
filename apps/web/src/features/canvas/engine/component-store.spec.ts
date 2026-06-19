import { describe, expect, it } from 'vitest';
import { addComponent, removeComponent } from './component-store';
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
