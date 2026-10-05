import { describe, it, expect } from 'vitest';
import {
  SYNC_EVENTS,
  MAX_PRESENCE_COLOR_LENGTH,
  MAX_PRESENCE_ID_LENGTH,
  MAX_PRESENCE_NAME_LENGTH,
  MAX_PRESENCE_SELECTION,
  awarenessStateSchema,
  clockAckSchema,
  syncErrorSchema,
  presenceUserSchema,
} from './sync.schema';

describe('sync contract', () => {
  it('exposes stable event names', () => {
    expect(SYNC_EVENTS.update).toBe('board:update');
    expect(SYNC_EVENTS.serverSync).toBe('board:sync');
    expect(SYNC_EVENTS.clientSync).toBe('board:client-sync');
    expect(SYNC_EVENTS.join).toBe('board:join');
  });

  it('validates an error payload', () => {
    const ok = syncErrorSchema.safeParse({ code: 'forbidden', message: 'nope' });
    expect(ok.success).toBe(true);
    const bad = syncErrorSchema.safeParse({ code: 'teapot', message: 'x' });
    expect(bad.success).toBe(false);
  });
});

describe('presence contract', () => {
  it('exposes the awareness event name', () => {
    expect(SYNC_EVENTS.awareness).toBe('board:awareness');
  });
  it('validates a presence user', () => {
    expect(presenceUserSchema.safeParse({ id: 'u1', name: 'A', color: '#fff' }).success).toBe(true);
    expect(presenceUserSchema.safeParse({ id: 'u1', name: 'A' }).success).toBe(false);
  });
});

describe('server clock contract', () => {
  it('exposes the clock event name', () => {
    expect(SYNC_EVENTS.clock).toBe('board:clock');
  });
  it('validates a clock acknowledgement', () => {
    expect(clockAckSchema.safeParse({ serverNow: 1_700_000_000_000 }).success).toBe(true);
    expect(clockAckSchema.safeParse({ serverNow: 'now' }).success).toBe(false);
    expect(clockAckSchema.safeParse({}).success).toBe(false);
  });
});

describe('awareness state contract', () => {
  const user = { id: 'u1', name: 'Ada', color: '#0f0' };

  it('accepts every field the web client publishes, and a state with none yet', () => {
    expect(
      awarenessStateSchema.safeParse({
        user,
        cursor: { x: 1.5, y: -2 },
        selection: ['a', 'b'],
        laser: { x: 3, y: 4, t: 1_700_000_000_000 },
        presenting: { slideIndex: 0, frameId: '__board__' },
      }).success,
    ).toBe(true);
    expect(awarenessStateSchema.safeParse({ user, cursor: null, laser: null, presenting: null }).success).toBe(true);
    expect(awarenessStateSchema.safeParse({}).success).toBe(true);
    expect(awarenessStateSchema.safeParse({ selection: [] }).success).toBe(true);
  });

  it.each([
    ['a user without name or color', { user: { id: 'u1' } }],
    ['a selection that is not an array', { user, selection: 'x' }],
    ['a selection of non-strings', { user, selection: [1] }],
    ['an over-long selection id', { user, selection: ['x'.repeat(MAX_PRESENCE_ID_LENGTH + 1)] }],
    ['too many selected ids', { user, selection: Array.from({ length: MAX_PRESENCE_SELECTION + 1 }, (_, i) => `e${i}`) }],
    ['a cursor without coordinates', { user, cursor: { x: 1 } }],
    ['a cursor with string coordinates', { user, cursor: { x: '1', y: 2 } }],
    ['a non-finite cursor', { user, cursor: { x: Number.POSITIVE_INFINITY, y: 0 } }],
    ['a laser without a timestamp', { user, laser: { x: 1, y: 2 } }],
    ['a presenting slide that is not an index', { user, presenting: { slideIndex: -1, frameId: 'f' } }],
    ['a presenting frame that is not a string', { user, presenting: { slideIndex: 0, frameId: 7 } }],
    ['an over-long name', { user: { ...user, name: 'x'.repeat(MAX_PRESENCE_NAME_LENGTH + 1) } }],
    ['an over-long color', { user: { ...user, color: '#'.repeat(MAX_PRESENCE_COLOR_LENGTH + 1) } }],
    ['an empty user id', { user: { ...user, id: '' } }],
  ])('rejects %s', (_label, state) => {
    expect(awarenessStateSchema.safeParse(state).success).toBe(false);
  });
});
