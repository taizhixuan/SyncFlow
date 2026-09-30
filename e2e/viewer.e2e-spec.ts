import { expect, test } from '@playwright/test';
import { createBoard, shareBoard, signUpInContext } from './support/api';
import { drawBox, elementsOfType, openBoard } from './support/board';

test('a viewer gets a read-only board that still receives live edits', async ({ browser }) => {
  const ownerCtx = await browser.newContext();
  const viewerCtx = await browser.newContext();
  try {
    const owner = await signUpInContext(ownerCtx, 'Olga');
    const viewer = await signUpInContext(viewerCtx, 'Vic');
    const boardId = await createBoard(ownerCtx.request, owner, 'Viewer mode');
    await shareBoard(ownerCtx.request, owner, viewer, boardId, 'viewer');

    const a = await ownerCtx.newPage();
    const b = await viewerCtx.newPage();
    await openBoard(a, boardId);
    await openBoard(b, boardId);

    // Read-only chrome: the badge is shown and every drawing tool is gone.
    await expect(b.getByText('view only', { exact: true })).toBeVisible();
    const tools = b.getByRole('toolbar', { name: 'Drawing tools' });
    await expect(tools.getByRole('button', { name: /^Select/ })).toBeVisible();
    for (const name of [/^Rectangle/, /^Ellipse/, /^Sticky note/, /^Pen/, /^Text/]) {
      await expect(tools.getByRole('button', { name })).toHaveCount(0);
    }
    await expect(b.getByRole('button', { name: 'Share' })).toHaveCount(0);
    await expect(a.getByText('view only', { exact: true })).toHaveCount(0);

    // The owner's edits still stream in.
    await drawBox(a, /^Rectangle/, { x: 300, y: 200 }, { x: 460, y: 320 });
    await expect.poll(async () => (await elementsOfType(b, 'rect')).length).toBe(1);
  } finally {
    await ownerCtx.close();
    await viewerCtx.close();
  }
});
