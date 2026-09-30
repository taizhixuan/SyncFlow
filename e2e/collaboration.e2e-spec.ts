import { expect, test } from '@playwright/test';
import { createBoard, signUpInContext } from './support/api';
import {
  drawBox,
  dragOnCanvas,
  elementsOfType,
  expectLive,
  openBoard,
  paintedTexts,
  wiggleCursor,
} from './support/board';

/**
 * The headline flow (CLAUDE.md §6): two people in two isolated browser
 * contexts edit one board, and shapes and cursors show up on both screens.
 */
test('two collaborators see each other’s shapes and cursors live', async ({ browser }) => {
  const ownerCtx = await browser.newContext();
  const guestCtx = await browser.newContext();
  try {
    const owner = await signUpInContext(ownerCtx, 'Ava');
    const guest = await signUpInContext(guestCtx, 'Ben');
    const boardId = await createBoard(ownerCtx.request, owner, 'Headline flow');

    const a = await ownerCtx.newPage();
    const b = await guestCtx.newPage();
    await openBoard(a, boardId);

    // Owner invites the guest through the real sharing panel.
    await a.getByRole('button', { name: 'Share' }).click();
    const sharing = a.getByRole('dialog', { name: 'Board sharing' });
    const linkSection = sharing.getByRole('region', { name: 'Share link' });
    await linkSection.getByLabel('Role').selectOption('editor');
    await linkSection.getByRole('button', { name: 'Create share link' }).click();
    const inviteUrl = (await linkSection.getByText(/\/invite\//).textContent())?.trim() ?? '';
    expect(inviteUrl).toMatch(/\/invite\/[^/]+$/);
    await sharing.getByRole('button', { name: 'Close sharing panel' }).click();

    // Guest opens the link and joins.
    await b.goto(new URL(inviteUrl).pathname);
    await expect(b.getByText(/join as/)).toContainText('editor');
    await b.getByRole('button', { name: 'Accept invite' }).click();
    await expect(b).toHaveURL(new RegExp(`/app/board/${boardId}$`));
    await expectLive(b);

    // Each sees the other in the (DOM) presence stack.
    await expect(a.getByLabel('People online').getByTitle(guest.displayName)).toBeVisible();
    await expect(b.getByLabel('People online').getByTitle(owner.displayName)).toBeVisible();

    // Owner draws a rectangle → it lands on the guest's canvas.
    await drawBox(a, /^Rectangle/, { x: 300, y: 200 }, { x: 460, y: 320 });
    await expect.poll(async () => (await elementsOfType(a, 'rect')).length).toBe(1);
    const [rect] = await elementsOfType(a, 'rect');
    await expect
      .poll(async () => (await elementsOfType(b, 'rect')).map((e) => e.id))
      .toEqual([rect!.id]);

    // Guest adds an ellipse → it lands on the owner's canvas.
    await drawBox(b, /^Ellipse/, { x: 600, y: 250 }, { x: 720, y: 360 });
    await expect.poll(async () => (await elementsOfType(a, 'ellipse')).length).toBe(1);

    // Guest moves the owner's rectangle → the owner sees the new position.
    await b.keyboard.press('Escape');
    await dragOnCanvas(b, { x: 380, y: 260 }, { x: 480, y: 360 });
    await expect
      .poll(async () => (await elementsOfType(a, 'rect'))[0]?.x ?? rect!.x)
      .toBeGreaterThan(rect!.x + 50);

    // Owner's cursor is painted on the guest's canvas with the owner's name.
    await wiggleCursor(a, { x: 200, y: 450 });
    await expect.poll(() => paintedTexts(b)).toContain(owner.displayName);
  } finally {
    await ownerCtx.close();
    await guestCtx.close();
  }
});
