import {
  decodeAwarenessEntries,
  decodeAwarenessUpdate,
  encodeAwarenessRemoval,
  encodeAwarenessUpdate,
} from './awareness-codec';

describe('decodeAwarenessUpdate', () => {
  it('reads the y-protocols wire format (count, then clientID/clock/JSON per entry)', () => {
    const json = Buffer.from('{"a":1}', 'utf8');
    // 1 entry: clientID 5, clock 1, 7-byte JSON string
    const bytes = new Uint8Array([1, 5, 1, json.length, ...json]);
    expect(decodeAwarenessUpdate(bytes)).toEqual([{ clientId: 5, clock: 1, removed: false }]);
  });

  it('decodes multi-byte varuints (real client ids are 32-bit)', () => {
    // 300 = 0b1_0010_1100 → [0xac, 0x02]; state "null" marks a removal
    const nul = Buffer.from('null', 'utf8');
    const bytes = new Uint8Array([1, 0xac, 0x02, 0x80, 0x01, nul.length, ...nul]);
    expect(decodeAwarenessUpdate(bytes)).toEqual([{ clientId: 300, clock: 128, removed: true }]);
  });

  it('returns null for truncated or garbage input instead of throwing', () => {
    expect(decodeAwarenessUpdate(new Uint8Array([2, 5, 1]))).toBeNull();
    expect(decodeAwarenessUpdate(new Uint8Array([1, 2, 3, 42]))).toBeNull();
    expect(decodeAwarenessUpdate(new Uint8Array())).toBeNull();
  });
});

describe('encodeAwarenessRemoval', () => {
  it('round-trips as a removal at the last announced clock (peers drop a held state at an equal clock)', () => {
    // Not clock + 1: a client kicked by the server re-announces at clock + 1
    // on reconnect, and peers would ignore that as no newer than the removal.
    const bytes = encodeAwarenessRemoval([
      { clientId: 3_000_000_000, clock: 4 },
      { clientId: 7, clock: 0 },
    ]);
    expect(decodeAwarenessUpdate(bytes)).toEqual([
      { clientId: 3_000_000_000, clock: 4, removed: true },
      { clientId: 7, clock: 0, removed: true },
    ]);
  });
});

describe('decodeAwarenessEntries / encodeAwarenessUpdate', () => {
  it('exposes each entry with its raw JSON state', () => {
    const json = Buffer.from('{"user":{"id":"u1"}}', 'utf8');
    const bytes = new Uint8Array([1, 5, 2, json.length, ...json]);
    expect(decodeAwarenessEntries(bytes)).toEqual([{ clientId: 5, clock: 2, state: '{"user":{"id":"u1"}}' }]);
  });

  it('round-trips entries, including multi-byte UTF-8 states and 32-bit client ids', () => {
    const entries = [
      { clientId: 3_000_000_000, clock: 300, state: '{"user":{"name":"Zoë 🚀"}}' },
      { clientId: 7, clock: 1, state: 'null' },
    ];
    expect(decodeAwarenessEntries(encodeAwarenessUpdate(entries))).toEqual(entries);
  });

  it('encodes a large state without blowing the argument limit', () => {
    const state = JSON.stringify({ selection: 'x'.repeat(200_000) });
    const out = decodeAwarenessEntries(encodeAwarenessUpdate([{ clientId: 1, clock: 1, state }]));
    expect(out?.[0]?.state).toBe(state);
  });

  it('returns null for malformed input', () => {
    expect(decodeAwarenessEntries(new Uint8Array([1, 2, 3, 42]))).toBeNull();
  });
});
