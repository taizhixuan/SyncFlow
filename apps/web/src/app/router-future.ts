import type { FutureConfig } from 'react-router-dom';

/**
 * React Router v7 behaviours, opted into early.
 *
 * Router v6 warns once per flag for anything it will change in v7. Both are
 * safe to take now, and taking them keeps the console clean enough that a real
 * warning stands out:
 *
 * - `v7_startTransition` wraps router state updates in `React.startTransition`,
 *   which is what React 18 wants anyway.
 * - `v7_relativeSplatPath` changes how relative paths resolve inside splat
 *   routes. The only splat here is the `*` catch-all, and it renders an
 *   absolute redirect, so nothing resolves relatively under it.
 *
 * Shared rather than written inline so the app, the tests and Storybook cannot
 * drift into rendering under different router semantics.
 */
export const ROUTER_FUTURE: Partial<FutureConfig> = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
};
