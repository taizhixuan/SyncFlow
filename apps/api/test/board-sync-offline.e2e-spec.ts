import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { io, type Socket } from 'socket.io-client';
import * as Y from 'yjs';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app-setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/auth/token.service';
import { SYNC_EVENTS } from '@syncflow/shared';

describe('BoardSync offline reconciliation (e2e)', () => {
  let app: INestApplication;
  let url: string;
  let token: string;
  let boardId: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.listen(0);
    const addr = app.getHttpServer().address();
    url = `http://localhost:${typeof addr === 'object' && addr ? addr.port : 0}`;

    const prisma = app.get(PrismaService);
    const user = await prisma.user.create({
      data: {
        email: `offline-${Date.now()}@t.app`,
        displayName: 'Offline',
        color: '#aaa',
        passwordHash: 'x',
      },
    });
    const board = await prisma.board.create({
      data: { ownerId: user.id, title: 'offline-board', members: { create: { userId: user.id, role: 'owner' } } },
    });
    boardId = board.id;
    token = app.get(TokenService).signAccessToken({ sub: user.id, email: user.email });
  });

  afterAll(async () => {
    await app.close();
  });

  // Resolves once the gateway's connection handler has fully run (joined the room
  // and emitted serverSync), so the socket is ready to send and receive board updates.
  function client(): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const s = io(url, { auth: { token }, query: { boardId, token }, transports: ['websocket'] });
      s.on(SYNC_EVENTS.serverSync, () => resolve(s));
      s.on(SYNC_EVENTS.error, (e: unknown) =>
        reject(new Error(`gateway rejected handshake: ${JSON.stringify(e)}`)),
      );
      s.on('connect_error', reject);
    });
  }

  it('merges edits made while a client was disconnected, on reconnect', async () => {
    const a = await client();
    const b = await client();

    // B tracks its Yjs doc from server fan-out
    const ydocB = new Y.Doc();
    b.on(SYNC_EVENTS.serverSync, (u: ArrayBuffer) => Y.applyUpdate(ydocB, new Uint8Array(u)));
    b.on(SYNC_EVENTS.update, (u: ArrayBuffer) => Y.applyUpdate(ydocB, new Uint8Array(u)));

    // A builds a local Yjs doc, then disconnects to simulate going offline
    const ydocA = new Y.Doc();
    a.disconnect();
    await new Promise<void>((r) => setTimeout(r, 100));

    // Offline edit: A adds an element while disconnected
    const inner = new Y.Map();
    ydocA.transact(() => {
      inner.set('id', 'offline-1');
      ydocA.getMap('elements').set('offline-1', inner);
    });

    // Set up listener on B BEFORE A reconnects to avoid missing the fan-out
    const received = new Promise<void>((resolve, reject) => {
      const t = setTimeout(
        () => reject(new Error('B never received the offline edit within 5 s')),
        5000,
      );
      b.on(SYNC_EVENTS.update, (u: ArrayBuffer) => {
        Y.applyUpdate(ydocB, new Uint8Array(u));
        if (ydocB.getMap('elements').has('offline-1')) {
          clearTimeout(t);
          resolve();
        }
      });
    });

    // A reconnects; wait for serverSync to confirm the gateway accepted the re-handshake
    a.connect();
    await new Promise<void>((resolve) => a.once(SYNC_EVENTS.serverSync, () => resolve()));

    // A hands the server its full state (offline edits included); server merges + fans out
    a.emit(SYNC_EVENTS.clientSync, Y.encodeStateAsUpdate(ydocA));

    await received;

    expect(ydocB.getMap('elements').has('offline-1')).toBe(true);

    a.disconnect();
    b.disconnect();
  }, 15000);
});
