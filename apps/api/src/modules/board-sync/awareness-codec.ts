/**
 * Minimal reader/writer for the y-protocols Awareness update wire format:
 *   varUint(count) then, per entry, varUint(clientID) varUint(clock) varString(JSON state)
 * (lib0 encoding: 7-bit little-endian varuints, strings length-prefixed UTF-8).
 *
 * The relay reads entries to validate them (a socket may only speak for its
 * own clientIDs and user), to re-encode an update with offending entries
 * removed, and to broadcast the removal of a dropped socket's clientIDs —
 * without that, peers keep a ghost cursor until the ~30 s timeout.
 * Implemented here because y-protocols is not an api dependency.
 */

/** One entry as it travels on the wire; `state` is the raw JSON text ('null' = removed). */
export interface RawAwarenessEntry {
  clientId: number;
  clock: number;
  state: string;
}

export interface AwarenessEntry {
  clientId: number;
  clock: number;
  /** The entry carried a `null` state (the client left). */
  removed: boolean;
}

class Reader {
  private pos = 0;

  constructor(private readonly bytes: Uint8Array) {}

  varUint(): number {
    let value = 0;
    let scale = 1;
    // Multiplication, not bit shifts: clientIDs are 32-bit and shifts are signed.
    for (let i = 0; i < 8; i += 1) {
      const byte = this.bytes[this.pos];
      if (byte === undefined) throw new RangeError('truncated varuint');
      this.pos += 1;
      value += (byte & 0x7f) * scale;
      if (byte < 0x80) return value;
      scale *= 0x80;
    }
    throw new RangeError('varuint too long');
  }

  varString(): string {
    const length = this.varUint();
    const end = this.pos + length;
    if (end > this.bytes.length) throw new RangeError('truncated string');
    const text = Buffer.from(this.bytes.subarray(this.pos, end)).toString('utf8');
    this.pos = end;
    return text;
  }
}

function varUintBytes(value: number): Buffer {
  const out: number[] = [];
  let rest = value;
  while (rest >= 0x80) {
    out.push((rest % 0x80) | 0x80);
    rest = Math.floor(rest / 0x80);
  }
  out.push(rest);
  return Buffer.from(out);
}

/** Decode an update keeping each raw state; null when the bytes are not a well-formed update. */
export function decodeAwarenessEntries(bytes: Uint8Array): RawAwarenessEntry[] | null {
  try {
    const reader = new Reader(bytes);
    const count = reader.varUint();
    const entries: RawAwarenessEntry[] = [];
    for (let i = 0; i < count; i += 1) {
      const clientId = reader.varUint();
      const clock = reader.varUint();
      const state = reader.varString();
      entries.push({ clientId, clock, state });
    }
    return entries;
  } catch {
    return null;
  }
}

/** Decode an awareness update; null when the bytes are not a well-formed update. */
export function decodeAwarenessUpdate(bytes: Uint8Array): AwarenessEntry[] | null {
  const entries = decodeAwarenessEntries(bytes);
  if (!entries) return null;
  return entries.map(({ clientId, clock, state }) => ({ clientId, clock, removed: state === 'null' }));
}

export function encodeAwarenessUpdate(entries: RawAwarenessEntry[]): Uint8Array {
  // Chunks + one concat: a spread push of a large state would exceed the
  // engine's argument-count limit.
  const chunks: Buffer[] = [varUintBytes(entries.length)];
  for (const { clientId, clock, state } of entries) {
    const text = Buffer.from(state, 'utf8');
    chunks.push(varUintBytes(clientId), varUintBytes(clock), varUintBytes(text.length), text);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

/**
 * Encode a removal for each client. The clock is bumped past the last one seen
 * so every peer's applyAwarenessUpdate treats it as newer and deletes the state.
 */
export function encodeAwarenessRemoval(clients: Array<{ clientId: number; clock: number }>): Uint8Array {
  return encodeAwarenessUpdate(clients.map(({ clientId, clock }) => ({ clientId, clock: clock + 1, state: 'null' })));
}
