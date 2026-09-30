import { describe, it, expect, vi } from 'vitest';
import * as Y from 'yjs';
import type { Comment, CommentReply } from '@syncflow/shared';
import {
  getCommentsMap,
  toPlainComments,
  insertComment,
  appendReply,
  setResolved,
} from './comments-doc';

const base = (id: string): Comment => ({
  id,
  elementId: 'el-1',
  authorId: 'u1',
  authorName: 'Alice',
  body: 'hi',
  resolved: false,
  createdAt: 1,
  replies: [],
});

const reply = (id: string, createdAt: number): CommentReply => ({
  id,
  authorId: id,
  authorName: id,
  body: `from ${id}`,
  createdAt,
});

function pair(): [Y.Doc, Y.Doc] {
  const A = new Y.Doc();
  const B = new Y.Doc();
  insertComment(getCommentsMap(A), base('c1'));
  Y.applyUpdate(B, Y.encodeStateAsUpdate(A));
  return [A, B];
}

function exchange(A: Y.Doc, B: Y.Doc): void {
  Y.applyUpdate(A, Y.encodeStateAsUpdate(B));
  Y.applyUpdate(B, Y.encodeStateAsUpdate(A));
}

describe('comments-doc concurrency', () => {
  it('keeps two concurrent replies', () => {
    const [A, B] = pair();
    appendReply(getCommentsMap(A), 'c1', reply('ra', 10));
    appendReply(getCommentsMap(B), 'c1', reply('rb', 11));
    exchange(A, B);
    const a = toPlainComments(getCommentsMap(A))[0]!;
    const b = toPlainComments(getCommentsMap(B))[0]!;
    expect(a.replies.map((r) => r.id).sort()).toEqual(['ra', 'rb']);
    expect(b).toEqual(a);
  });

  it('a concurrent resolve does not drop a reply', () => {
    const [A, B] = pair();
    appendReply(getCommentsMap(A), 'c1', reply('ra', 10));
    setResolved(getCommentsMap(B), 'c1', true);
    exchange(A, B);
    const a = toPlainComments(getCommentsMap(A))[0]!;
    expect(a.resolved).toBe(true);
    expect(a.replies.map((r) => r.id)).toEqual(['ra']);
  });

  it('reads legacy plain comments and migrates on first write', () => {
    const doc = new Y.Doc();
    const map = getCommentsMap(doc);
    map.set('old', { ...base('old'), replies: [reply('r0', 2)] });
    expect(toPlainComments(map)[0]!.replies).toHaveLength(1);
    appendReply(map, 'old', reply('r1', 3));
    expect(map.get('old')).toBeInstanceOf(Y.Map);
    const c = toPlainComments(map)[0]!;
    expect(c.replies.map((r) => r.id)).toEqual(['r0', 'r1']);
    expect(c.body).toBe('hi');
  });

  it('drops malformed comments and warns once per id', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const doc = new Y.Doc();
    const map = getCommentsMap(doc);
    insertComment(map, base('good'));
    map.set('bad-comment', { id: 'bad-comment', body: 42 });
    expect(toPlainComments(map).map((c) => c.id)).toEqual(['good']);
    toPlainComments(map);
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('bad-comment'))).toHaveLength(1);
    warn.mockRestore();
  });
});
