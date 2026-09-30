/**
 * Minimal reader/writer for the y-protocols Awareness update wire format:
 *   varUint(count) then, per entry, varUint(clientID) varUint(clock) varString(JSON state)
 * (lib0 encoding: 7-bit little-endian varuints, strings length-prefixed UTF-8).
 *
 * The relay otherwise treats awareness as opaque bytes. It only needs the
 * clientIDs a socket announced so it can broadcast their removal when that
 * socket drops — without it peers keep a ghost cursor until the ~30 s timeout.
 * Implemented here because y-protocols is not an api dependency.
 */

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

function writeVarUint(out: number[], value: number): void {
  let rest = value;
  while (rest >= 0x80) {
    out.push((rest % 0x80) | 0x80);
    rest = Math.floor(rest / 0x80);
  }
  out.push(rest);
}

/** Decode an awareness update; null when the bytes are not a well-formed update. */
export function decodeAwarenessUpdate(bytes: Uint8Array): AwarenessEntry[] | null {
  try {
    const reader = new Reader(bytes);
    const count = reader.varUint();
    const entries: AwarenessEntry[] = [];
    for (let i = 0; i < count; i += 1) {
      const clientId = reader.varUint();
      const clock = reader.varUint();
      const state = reader.varString();
      entries.push({ clientId, clock, removed: state === 'null' });
    }
    return entries;
  } catch {
    return null;
  }
}

/**
 * Encode a removal for each client. The clock is bumped past the last one seen
 * so every peer's applyAwarenessUpdate treats it as newer and deletes the state.
 */
export function encodeAwarenessRemoval(clients: Array<{ clientId: number; clock: number }>): Uint8Array {
  const out: number[] = [];
  const nul = Buffer.from('null', 'utf8');
  writeVarUint(out, clients.length);
  for (const { clientId, clock } of clients) {
    writeVarUint(out, clientId);
    writeVarUint(out, clock + 1);
    writeVarUint(out, nul.length);
    out.push(...nul);
  }
  return new Uint8Array(out);
}
