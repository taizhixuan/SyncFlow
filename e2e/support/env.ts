/**
 * Ports and endpoints for the Playwright stack. Deliberately off the dev
 * defaults (:3000 API, :5173 web) so the suite can run beside `pnpm dev`.
 */
export const API_PORT = Number(process.env.E2E_API_PORT ?? 3101);
export const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5183);

export const API_URL = `http://localhost:${API_PORT}`;
export const WEB_URL = `http://localhost:${WEB_PORT}`;

/** A Redis logical db used only by this suite (the Jest e2e suite uses /1). */
export const E2E_REDIS_URL = process.env.E2E_REDIS_URL ?? 'redis://localhost:6379/3';
