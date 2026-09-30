import { readFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { API_PORT, API_URL, E2E_REDIS_URL, WEB_PORT, WEB_URL } from './e2e/support/env';

const isCI = Boolean(process.env.CI);

/**
 * The Jest e2e suite TRUNCATEs the `.env.test` database between specs, which
 * would wipe users out from under a running browser test. The browser suite
 * therefore uses a sibling database (same server and credentials, name
 * suffixed `_web_e2e`); `prisma migrate deploy` creates it on first run.
 */
function webE2eDatabaseUrl(): string {
  if (process.env.E2E_DATABASE_URL) return process.env.E2E_DATABASE_URL;
  const envTest = readFileSync(path.join(__dirname, '.env.test'), 'utf8');
  const base = /^DATABASE_URL=(.+)$/m.exec(envTest)?.[1]?.trim();
  if (!base) throw new Error('.env.test has no DATABASE_URL');
  const url = new URL(base);
  url.pathname = `${url.pathname}_web_e2e`;
  return url.toString();
}

/**
 * Browser e2e for the headline flow (CLAUDE.md §6). Playwright boots its own
 * API + Vite pair on dedicated ports so a developer's `pnpm dev` (:3000/:5173)
 * keeps running untouched. The API runs with the `.env.test` settings, but on
 * its own database and Redis logical db so rate-limit buckets can be reset
 * between signups and other suites can't pull rows out from under it.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.e2e-spec\.ts$/,
  outputDir: './test-results/web-e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 2 : 4,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: isCI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: WEB_URL,
    headless: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1280, height: 800 },
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // Compile the API into node_modules/.cache (not apps/api/dist, which
      // `nest start --watch` owns and wipes) so a running dev API is unaffected.
      // Node still resolves the API's own dependencies from apps/api/node_modules.
      command: [
        'pnpm --filter @syncflow/shared build',
        'pnpm run db:test:deploy',
        'pnpm --filter @syncflow/api exec tsc -p tsconfig.build.json --outDir node_modules/.cache/e2e-dist',
        'pnpm exec dotenv -e .env.test -- node apps/api/node_modules/.cache/e2e-dist/main.js',
      ].join(' && '),
      url: `${API_URL}/api/v1/health/live`,
      reuseExistingServer: !isCI,
      timeout: 180_000,
      stdout: 'ignore',
      stderr: 'pipe',
      // Explicit env wins over .env.test (dotenv-cli never overrides set vars).
      env: {
        NODE_ENV: 'test',
        DATABASE_URL: webE2eDatabaseUrl(),
        API_PORT: String(API_PORT),
        WEB_ORIGIN: WEB_URL,
        REDIS_URL: E2E_REDIS_URL,
        // Redis-backed buckets (not the in-memory test default) so specs can
        // clear them: signup allows 10 per IP per 10 minutes.
        THROTTLE_STORAGE: 'redis',
        SWAGGER_ENABLED: 'false',
        LOG_LEVEL: 'warn',
      },
    },
    {
      command: `pnpm --filter @syncflow/web exec vite --port ${WEB_PORT} --strictPort`,
      url: WEB_URL,
      reuseExistingServer: !isCI,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
      // Process env beats apps/web/.env.local, so a dev override can't point
      // the suite at the wrong API.
      env: {
        VITE_DEV_API_PROXY: API_URL,
        VITE_SYNC_URL: API_URL,
      },
    },
  ],
});
