import { describe, expect, it } from 'vitest';
import { commentSchema, commentReplySchema } from './comment.schema';
import type { Comment, CommentReply } from './comment.schema';

describe('commentReplySchema', () => {
  it('parses a valid reply', () => {
    const reply: CommentReply = {
      id: 'r1',
      authorId: 'u1',
      authorName: 'Alice',
      body: 'Looks good',
      createdAt: 1000,
    };
    expect(commentReplySchema.parse(reply)).toEqual(reply);
  });

  it('rejects a reply missing authorName', () => {
    expect(() =>
      commentReplySchema.parse({ id: 'r1', authorId: 'u1', body: 'x', createdAt: 1000 }),
    ).toThrow();
  });
});

describe('commentSchema', () => {
  it('parses an element-pinned comment', () => {
    const c: Comment = {
      id: 'c1',
      elementId: 'el-abc',
      authorId: 'u1',
      authorName: 'Alice',
      body: 'What color should this be?',
      resolved: false,
      createdAt: 2000,
      replies: [],
    };
    const parsed = commentSchema.parse(c);
    expect(parsed.id).toBe('c1');
    expect(parsed.elementId).toBe('el-abc');
    expect(parsed.point).toBeUndefined();
  });

  it('parses a board-point comment', () => {
    const c: Comment = {
      id: 'c2',
      point: { x: 100, y: 200 },
      authorId: 'u2',
      authorName: 'Bob',
      body: 'Board-level note',
      resolved: true,
      createdAt: 3000,
      replies: [
        { id: 'r1', authorId: 'u1', authorName: 'Alice', body: 'Agreed', createdAt: 3001 },
      ],
    };
    const parsed = commentSchema.parse(c);
    expect(parsed.point).toEqual({ x: 100, y: 200 });
    expect(parsed.elementId).toBeUndefined();
    expect(parsed.replies).toHaveLength(1);
  });

  it('rejects a comment missing required fields', () => {
    expect(() =>
      commentSchema.parse({ id: 'c3', authorId: 'u1', body: 'x', resolved: false, createdAt: 1 }),
    ).toThrow();
  });

  it('accepts a comment with both elementId and point (schema allows; caller enforces exclusion)', () => {
    // The schema deliberately does not enforce mutual exclusion at the type level
    // to keep it simple; callers must ensure exactly one is set.
    const parsed = commentSchema.parse({
      id: 'c4',
      elementId: 'el1',
      point: { x: 0, y: 0 },
      authorId: 'u1',
      authorName: 'Alice',
      body: 'x',
      resolved: false,
      createdAt: 1,
      replies: [],
    });
    expect(parsed.elementId).toBe('el1');
  });
});
