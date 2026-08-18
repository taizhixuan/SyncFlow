import { useEffect, useState } from 'react';

import { readDevicePixelRatio } from '../engine/dpr';

/**
 * The live `window.devicePixelRatio`, re-read whenever it changes.
 *
 * There is no `devicepixelratiochange` event. The standard trick is a media
 * query pinned to the *current* ratio: `(resolution: 2dppx)` matches only while
 * the ratio is exactly 2, so it stops matching the moment the ratio moves and
 * fires `change`. The query is inherently single-use — it has the old value
 * baked in — so it has to be torn down and rebuilt around every new ratio.
 *
 * A `resize` listener backs it up: browser zoom (the most common cause of a
 * ratio change) also resizes the viewport, and Safari only gained `resolution`
 * media-query support relatively recently.
 */
export function useDevicePixelRatio(): number {
  const [dpr, setDpr] = useState(readDevicePixelRatio);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let query: MediaQueryList | null = null;
    let disposed = false;

    const sync = (): void => {
      if (disposed) return;
      setDpr((prev) => {
        const next = readDevicePixelRatio();
        return next === prev ? prev : next;
      });
    };

    const handleChange = (): void => {
      teardownQuery();
      sync();
      armQuery();
    };

    const teardownQuery = (): void => {
      query?.removeEventListener('change', handleChange);
      query = null;
    };

    const armQuery = (): void => {
      if (disposed || typeof window.matchMedia !== 'function') return;
      query = window.matchMedia(`(resolution: ${readDevicePixelRatio()}dppx)`);
      query.addEventListener('change', handleChange);
    };

    armQuery();
    window.addEventListener('resize', sync);

    return () => {
      disposed = true;
      teardownQuery();
      window.removeEventListener('resize', sync);
    };
  }, []);

  return dpr;
}
