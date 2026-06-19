/**
 * tags.spec.ts — TDD-first tests for pure tag helpers (M4-Task3).
 */
import { describe, expect, it } from 'vitest';
import type { CanvasElement } from '@syncflow/shared';
import { allTags, elementsWithTag, tagCounts, addTag, removeTag } from './tags';

const el = (id: string, tags?: string[]): CanvasElement =>
  ({
    id,
    type: 'rect',
    x: 0,
    y: 0,
    rotation: 0,
    opacity: 1,
    zIndex: 0,
    fill: null,
    stroke: 'auto',
    strokeWidth: 2,
    tags,
  }) as CanvasElement;

describe('allTags', () => {
  it('returns empty array when no elements have tags', () => {
    expect(allTags([el('a'), el('b')])).toEqual([]);
  });

  it('returns unique sorted tags across elements', () => {
    const els = [el('a', ['beta', 'alpha']), el('b', ['alpha', 'gamma'])];
    expect(allTags(els)).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('ignores empty strings', () => {
    expect(allTags([el('a', ['', 'hello', ''])])).toEqual(['hello']);
  });

  it('deduplicates across elements', () => {
    expect(allTags([el('a', ['x']), el('b', ['x']), el('c', ['x'])])).toEqual(['x']);
  });

  it('handles elements with undefined tags gracefully', () => {
    expect(allTags([el('a', undefined), el('b', ['tag'])])).toEqual(['tag']);
  });
});

describe('elementsWithTag', () => {
  it('returns elements that have the given tag', () => {
    const els = [el('a', ['foo', 'bar']), el('b', ['bar']), el('c', ['baz'])];
    const result = elementsWithTag(els, 'bar');
    expect(result.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('returns empty array when no element has the tag', () => {
    expect(elementsWithTag([el('a', ['x'])], 'y')).toEqual([]);
  });

  it('returns empty for elements with no tags', () => {
    expect(elementsWithTag([el('a')], 'x')).toEqual([]);
  });
});

describe('tagCounts', () => {
  it('returns tag counts sorted descending', () => {
    const els = [
      el('a', ['hot', 'mild']),
      el('b', ['hot']),
      el('c', ['mild', 'cold']),
    ];
    const result = tagCounts(els);
    expect(result[0]).toEqual({ tag: 'hot', count: 2 });
    expect(result[1]).toEqual({ tag: 'mild', count: 2 });
    expect(result[2]).toEqual({ tag: 'cold', count: 1 });
  });

  it('returns empty array for no tags', () => {
    expect(tagCounts([el('a'), el('b')])).toEqual([]);
  });

  it('returns stable secondary sort by tag name when counts are equal', () => {
    const els = [el('a', ['z']), el('b', ['a'])];
    const result = tagCounts(els);
    // Both have count 1; alphabetically 'a' < 'z'
    expect(result[0]!.tag).toBe('a');
    expect(result[1]!.tag).toBe('z');
  });
});

describe('addTag', () => {
  it('adds a new tag to the array', () => {
    expect(addTag(['a'], 'b')).toEqual(['a', 'b']);
  });

  it('is idempotent — does not duplicate existing tag', () => {
    expect(addTag(['a', 'b'], 'a')).toEqual(['a', 'b']);
  });

  it('ignores blank strings', () => {
    expect(addTag(['a'], '')).toEqual(['a']);
    expect(addTag(['a'], '  ')).toEqual(['a']);
  });

  it('trims whitespace from the tag', () => {
    expect(addTag([], '  hello  ')).toEqual(['hello']);
  });

  it('handles empty source array', () => {
    expect(addTag([], 'x')).toEqual(['x']);
  });
});

describe('removeTag', () => {
  it('removes an existing tag', () => {
    expect(removeTag(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
  });

  it('is idempotent — does nothing when tag absent', () => {
    expect(removeTag(['a'], 'z')).toEqual(['a']);
  });

  it('handles empty source array', () => {
    expect(removeTag([], 'x')).toEqual([]);
  });
});
