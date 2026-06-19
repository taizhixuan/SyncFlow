import { describe, expect, it } from 'vitest';
import type { CanvasElement } from '@syncflow/shared';
import {
  totalVotes,
  myVotes,
  addVote,
  toggleReaction,
  reactionSummary,
  sortByVotes,
  topVotedIds,
} from './voting';

// Minimal CanvasElement fixture
const el = (id: string, overrides: Partial<CanvasElement> = {}): CanvasElement =>
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
    strokeStyle: 'solid',
    ...overrides,
  }) as CanvasElement;

describe('totalVotes', () => {
  it('returns 0 for element with no votes', () => {
    expect(totalVotes(el('a'))).toBe(0);
  });

  it('returns 0 for element with empty votes record', () => {
    expect(totalVotes(el('a', { votes: {} }))).toBe(0);
  });

  it('sums all user vote counts', () => {
    expect(totalVotes(el('a', { votes: { u1: 2, u2: 3 } }))).toBe(5);
  });

  it('counts single user vote', () => {
    expect(totalVotes(el('a', { votes: { u1: 1 } }))).toBe(1);
  });
});

describe('myVotes', () => {
  it('returns 0 when no votes on element', () => {
    expect(myVotes(el('a'), 'u1')).toBe(0);
  });

  it('returns 0 when user has no votes', () => {
    expect(myVotes(el('a', { votes: { u2: 2 } }), 'u1')).toBe(0);
  });

  it('returns the user vote count', () => {
    expect(myVotes(el('a', { votes: { u1: 3, u2: 1 } }), 'u1')).toBe(3);
  });
});

describe('addVote', () => {
  it('adds a vote for a new user', () => {
    const result = addVote({}, 'u1', 1);
    expect(result).toEqual({ u1: 1 });
  });

  it('increments an existing user vote', () => {
    const result = addVote({ u1: 2 }, 'u1', 1);
    expect(result).toEqual({ u1: 3 });
  });

  it('decrements an existing user vote', () => {
    const result = addVote({ u1: 3 }, 'u1', -1);
    expect(result).toEqual({ u1: 2 });
  });

  it('removes the key when vote count reaches 0', () => {
    const result = addVote({ u1: 1 }, 'u1', -1);
    expect(result).not.toHaveProperty('u1');
  });

  it('clamps at 0 (never goes negative)', () => {
    const result = addVote({ u1: 0 }, 'u1', -5);
    expect(result).not.toHaveProperty('u1');
  });

  it('is pure (does not mutate the input)', () => {
    const input = { u1: 2 };
    addVote(input, 'u1', 1);
    expect(input).toEqual({ u1: 2 });
  });

  it('handles multi-delta addition', () => {
    const result = addVote({}, 'u1', 3);
    expect(result).toEqual({ u1: 3 });
  });
});

describe('toggleReaction', () => {
  it('adds user to an emoji list', () => {
    const result = toggleReaction({}, '👍', 'u1');
    expect(result).toEqual({ '👍': ['u1'] });
  });

  it('removes user from an emoji list', () => {
    const result = toggleReaction({ '👍': ['u1', 'u2'] }, '👍', 'u1');
    expect(result).toEqual({ '👍': ['u2'] });
  });

  it('drops the emoji key when the last user is removed', () => {
    const result = toggleReaction({ '👍': ['u1'] }, '👍', 'u1');
    expect(result).not.toHaveProperty('👍');
  });

  it('adds a new emoji while keeping existing ones', () => {
    const result = toggleReaction({ '👍': ['u1'] }, '❤️', 'u2');
    expect(result).toEqual({ '👍': ['u1'], '❤️': ['u2'] });
  });

  it('is pure (does not mutate input)', () => {
    const input = { '👍': ['u1'] };
    toggleReaction(input, '👍', 'u1');
    expect(input).toEqual({ '👍': ['u1'] });
  });
});

describe('reactionSummary', () => {
  it('returns empty array for element with no reactions', () => {
    expect(reactionSummary(el('a'))).toEqual([]);
  });

  it('returns sorted summary by count descending', () => {
    const summary = reactionSummary(el('a', { reactions: { '👍': ['u1', 'u2'], '❤️': ['u3'], '🎉': ['u1', 'u2', 'u3'] } }));
    expect(summary).toEqual([
      { emoji: '🎉', count: 3 },
      { emoji: '👍', count: 2 },
      { emoji: '❤️', count: 1 },
    ]);
  });

  it('handles single reaction', () => {
    const summary = reactionSummary(el('a', { reactions: { '👍': ['u1'] } }));
    expect(summary).toEqual([{ emoji: '👍', count: 1 }]);
  });
});

describe('sortByVotes', () => {
  it('returns empty array for empty input', () => {
    expect(sortByVotes([])).toEqual([]);
  });

  it('sorts elements by total votes descending', () => {
    const a = el('a', { votes: { u1: 1 } });
    const b = el('b', { votes: { u1: 3 } });
    const c = el('c', { votes: { u1: 2 } });
    const sorted = sortByVotes([a, b, c]);
    expect(sorted.map((e) => e.id)).toEqual(['b', 'c', 'a']);
  });

  it('puts elements with no votes at the end', () => {
    const a = el('a');
    const b = el('b', { votes: { u1: 1 } });
    const sorted = sortByVotes([a, b]);
    expect(sorted.map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('is pure (does not mutate input)', () => {
    const arr = [el('a'), el('b', { votes: { u1: 1 } })];
    sortByVotes(arr);
    expect(arr[0]!.id).toBe('a');
  });
});

describe('topVotedIds', () => {
  it('returns the top n elements by vote count', () => {
    const a = el('a', { votes: { u1: 1 } });
    const b = el('b', { votes: { u1: 3 } });
    const c = el('c', { votes: { u1: 2 } });
    expect(topVotedIds([a, b, c], 2)).toEqual(['b', 'c']);
  });

  it('returns all elements when n is omitted', () => {
    const a = el('a', { votes: { u1: 1 } });
    const b = el('b', { votes: { u1: 3 } });
    expect(topVotedIds([a, b])).toHaveLength(2);
  });

  it('returns empty array for no elements', () => {
    expect(topVotedIds([])).toEqual([]);
  });

  it('only returns elements with at least one vote', () => {
    const a = el('a');
    const b = el('b', { votes: { u1: 1 } });
    expect(topVotedIds([a, b])).toEqual(['b']);
  });
});
