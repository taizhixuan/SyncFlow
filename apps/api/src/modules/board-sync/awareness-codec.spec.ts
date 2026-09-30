import { decodeAwarenessUpdate, encodeAwarenessRemoval } from './awareness-codec';

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
  it('round-trips as a removal one clock ahead so peers drop the state', () => {
    const bytes = encodeAwarenessRemoval([
      { clientId: 3_000_000_000, clock: 4 },
      { clientId: 7, clock: 0 },
    ]);
    expect(decodeAwarenessUpdate(bytes)).toEqual([
      { clientId: 3_000_000_000, clock: 5, removed: true },
      { clientId: 7, clock: 1, removed: true },
    ]);
  });
});
