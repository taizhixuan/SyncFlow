import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { io, type Socket } from 'socket.io-client';
import * as Y from 'yjs';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app-setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/auth/token.service';
import { SYNC_EVENTS } from '@syncflow/shared';

// The stock AppModule, no provider overrides: Nest's teardown order is what
// production gets. Edits still inside the snapshot debounce window must be
// saved on shutdown, which only works if the flush runs before Prisma
// disconnects — otherwise every deploy silently drops the last seconds of work.
describe('BoardSync shutdown (e2e)', () => {
  it('persists edits still in the debounce window when the app closes', async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app: INestApplication = mod.createNestApplication();
    configureApp(app);
    await app.listen(0);
    const addr = app.getHttpServer().address();
    const url = `http://localhost:${typeof addr === 'object' && addr ? addr.port : 0}`;

    const prisma = app.get(PrismaService);
    const user = await prisma.user.create({
      data: { email: `shutdown-${Date.now()}@t.app`, displayName: 'Shutdown', color: '#fff', passwordHash: 'x' },
    });
    const board = await prisma.board.create({
      data: { ownerId: user.id, title: 'shutdown', members: { create: { userId: user.id, role: 'owner' } } },
    });
    const token = app.get(TokenService).signAccessToken({ sub: user.id, email: user.email });

    const socket: Socket = io(url, {
      auth: { token },
      query: { boardId: board.id },
      transports: ['websocket'],
    });
    await new Promise<void>((resolve) => socket.once(SYNC_EVENTS.serverSync, () => resolve()));

    const doc = new Y.Doc();
    const inner = new Y.Map();
    doc.transact(() => {
      inner.set('id', 'pending');
      doc.getMap('elements').set('pending', inner);
    });
    socket.emit(SYNC_EVENTS.update, Y.encodeStateAsUpdate(doc));
    // Long enough for the server to apply it, well inside the 3s debounce.
    await new Promise<void>((r) => setTimeout(r, 300));

    await app.close();
    socket.disconnect();

    // The app's own client is gone; read back with a fresh one.
    const reader = new PrismaClient();
    try {
      const latest = await reader.boardSnapshot.findFirst({
        where: { boardId: board.id },
        orderBy: { docVersion: 'desc' },
      });
      expect(latest).not.toBeNull();
      const saved = new Y.Doc();
      Y.applyUpdate(saved, new Uint8Array(latest!.yjsState));
      expect(saved.getMap('elements').has('pending')).toBe(true);
    } finally {
      await reader.$disconnect();
    }
  }, 20000);
});
