import { expect, test } from '@playwright/test';
import { newIdentity, resetRateLimits } from './support/api';
import { expectLive } from './support/board';

test('signup, create a board, survive a reload, then log out', async ({ page }) => {
  await resetRateLimits();
  const me = newIdentity('Sam');

  await page.goto('/signup');
  await page.getByLabel('Display name').fill(me.displayName);
  await page.getByLabel('Email').fill(me.email);
  await page.getByLabel('Password').fill(me.password);
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page).toHaveURL(/\/app$/);
  await expect(
    page.getByRole('heading', { name: `Welcome back, ${me.displayName}.` }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'New board' }).first().click();
  await expect(page).toHaveURL(/\/app\/board\/[0-9a-f-]{36}$/);
  await expectLive(page);
  const boardUrl = page.url();

  // The access token lives only in memory; a reload must restore the session
  // from the httpOnly refresh cookie and land back on the same board.
  await page.reload();
  await expect(page).toHaveURL(boardUrl);
  await expectLive(page);

  await page.getByRole('link', { name: 'Back to boards' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole('button', { name: /^Open / })).toHaveCount(1);

  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login/);

  // The session is really gone: a protected page bounces back to login.
  await page.goto('/app');
  await expect(page).toHaveURL(/\/login/);
});
