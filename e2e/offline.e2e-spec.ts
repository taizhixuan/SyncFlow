import { expect, test, type WebSocketRoute } from '@playwright/test';
import { createBoard, shareBoard, signUpInContext } from './support/api';
import { connectionStatus, drawBox, elementsOfType, openBoard } from './support/board';

test('an edit made offline reaches collaborators after reconnecting', async ({ browser }) => {
  const ownerCtx = await browser.newContext();
  const editorCtx = await browser.newContext();
  try {
    const owner = await signUpInContext(ownerCtx, 'Omar');
    const editor = await signUpInContext(editorCtx, 'Eli');
    const boardId = await createBoard(ownerCtx.request, owner, 'Offline reconciliation');
    await shareBoard(ownerCtx.request, owner, editor, boardId, 'editor');

    // `setOffline` fails new requests (socket.io's HTTP polling, new
    // handshakes) but Chromium can leave an already-open WebSocket flowing, so
    // on its own the editor would sometimes never notice the outage. Proxy the
    // editor's realtime socket so going offline also cuts that live
    // connection, as a real network drop would.
    let offline = false;
    const sockets = new Set<WebSocketRoute>();
    await editorCtx.routeWebSocket(/\/socket\.io\//, (ws) => {
      if (offline) {
        void ws.close();
        return;
      }
      const server = ws.connectToServer();
      // Engine.io's "5" packet completes the polling → WebSocket upgrade.
      ws.onMessage((message) => {
        if (message === '5') sockets.add(ws);
        server.send(message);
      });
      ws.onClose(() => sockets.delete(ws));
    });
    const goOffline = async (): Promise<void> => {
      offline = true;
      await editorCtx.setOffline(true);
      await Promise.all([...sockets].map((ws) => ws.close()));
    };
    const goOnline = async (): Promise<void> => {
      offline = false;
      await editorCtx.setOffline(false);
    };

    const a = await ownerCtx.newPage();
    const b = await editorCtx.newPage();
    await openBoard(a, boardId);
    await openBoard(b, boardId);
    // socket.io starts on HTTP long-polling and upgrades to a WebSocket. An
    // in-flight long-poll can outlive the offline switch for ~25s, so only cut
    // the network once the upgrade to the (routed) WebSocket has completed.
    await expect.poll(() => sockets.size).toBeGreaterThan(0);

    await goOffline();
    // The drop is visible to the user, not silent (CLAUDE.md §5 edge-state UX).
    await expect(connectionStatus(b)).not.toHaveAccessibleName('Connection: Live');

    await drawBox(b, /^Rectangle/, { x: 300, y: 200 }, { x: 460, y: 320 });
    await expect.poll(async () => (await elementsOfType(b, 'rect')).length).toBe(1);
    // Nothing leaks through while the editor is offline.
    await a.waitForTimeout(1_000);
    expect(await elementsOfType(a, 'rect')).toHaveLength(0);

    await goOnline();
    // socket.io backs off up to 5s between attempts, so allow a few cycles.
    await expect(connectionStatus(b)).toHaveAccessibleName('Connection: Live', {
      timeout: 30_000,
    });
    const [rect] = await elementsOfType(b, 'rect');
    await expect
      .poll(async () => (await elementsOfType(a, 'rect')).map((e) => e.id), { timeout: 20_000 })
      .toEqual([rect!.id]);
  } finally {
    await ownerCtx.close();
    await editorCtx.close();
  }
});
