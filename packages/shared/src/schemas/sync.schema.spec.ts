import { describe, it, expect } from 'vitest';
import { SYNC_EVENTS, syncErrorSchema } from './sync.schema';

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
