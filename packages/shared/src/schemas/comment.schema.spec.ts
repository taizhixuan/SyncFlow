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
});

describe('commentSchema pin target', () => {
  const common = {
    id: 'c9',
    authorId: 'u1',
    authorName: 'A',
    body: 'x',
    resolved: false,
    createdAt: 1,
    replies: [],
  };

  it('rejects a comment with neither elementId nor point', () => {
    expect(commentSchema.safeParse(common).success).toBe(false);
  });

  it('rejects a comment with both elementId and point', () => {
    expect(
      commentSchema.safeParse({ ...common, elementId: 'e', point: { x: 0, y: 0 } }).success,
    ).toBe(false);
  });
});
