import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { snapshot } from './use-presence';

function makeRemote(): Awareness {
  // A second Y.Doc/Awareness gives a distinct clientID so its state is "remote"
  // relative to the awareness we query.
  return new Awareness(new Y.Doc());
}

describe('usePresence snapshot', () => {
  it('excludes the local client and entries without a user', () => {
    const local = new Awareness(new Y.Doc());
    local.setLocalStateField('user', { id: 'me', name: 'Me', color: '#000' });

    // Simulate two remote states applied into the local awareness map.
    const remoteA = makeRemote();
    remoteA.setLocalStateField('user', { id: 'a', name: 'Alice', color: '#f00' });
    remoteA.setLocalStateField('cursor', { x: 1, y: 2 });
    local.states.set(remoteA.clientID, remoteA.getLocalState()!);

    // A client that joined but never published a user (no avatar/cursor yet).
    local.states.set(999, { cursor: { x: 5, y: 5 } });

    const out = snapshot(local);
    expect(out).toHaveLength(1);
    expect(out[0]!.user.id).toBe('a');
    expect(out[0]!.cursor).toEqual({ x: 1, y: 2 });
    expect(out[0]!.selection).toEqual([]);
  });

  it('returns only entries that have a user field', () => {
    const local = new Awareness(new Y.Doc());

    const remoteB = makeRemote();
    remoteB.setLocalStateField('user', { id: 'b', name: 'Bob', color: '#00f' });
    local.states.set(remoteB.clientID, remoteB.getLocalState()!);

    // A client with no user field should be filtered out.
    local.states.set(888, { cursor: { x: 10, y: 20 } });

    const out = snapshot(local);
    expect(out).toHaveLength(1);
    expect(out[0]!.user.id).toBe('b');
  });

  // ── Laser pointer (Feature A) ────────────────────────────────────────────────

  it('passes laser field through when set', () => {
    const local = new Awareness(new Y.Doc());

    const remoteC = makeRemote();
    remoteC.setLocalStateField('user', { id: 'c', name: 'Carol', color: '#0f0' });
    remoteC.setLocalStateField('laser', { x: 42, y: 100, t: 12345 });
    local.states.set(remoteC.clientID, remoteC.getLocalState()!);

    const out = snapshot(local);
    expect(out).toHaveLength(1);
    expect(out[0]!.laser).toEqual({ x: 42, y: 100, t: 12345 });
  });

  it('laser field defaults to null when not set', () => {
    const local = new Awareness(new Y.Doc());

    const remoteD = makeRemote();
    remoteD.setLocalStateField('user', { id: 'd', name: 'Dave', color: '#00f' });
    // No laser field published
    local.states.set(remoteD.clientID, remoteD.getLocalState()!);

    const out = snapshot(local);
    expect(out).toHaveLength(1);
    expect(out[0]!.laser).toBeNull();
  });
  it('exposes the awareness clientId so one user in two tabs yields two distinct entries', () => {
    const local = new Awareness(new Y.Doc());
    const tab1 = makeRemote();
    const tab2 = makeRemote();
    for (const tab of [tab1, tab2]) {
      tab.setLocalStateField('user', { id: 'same-user', name: 'Eve', color: '#f0f' });
      local.states.set(tab.clientID, tab.getLocalState()!);
    }

    const out = snapshot(local);
    expect(out.map((r) => r.clientId).sort()).toEqual([tab1.clientID, tab2.clientID].sort());
    expect(new Set(out.map((r) => r.clientId)).size).toBe(2);
  });
});
