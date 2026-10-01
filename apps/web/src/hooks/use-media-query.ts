import { useEffect, useState } from 'react';

/** Below Tailwind's `md` breakpoint: the editor switches to its phone layout. */
export const PHONE_QUERY = '(max-width: 767px)';

function matches(query: string): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
}

/**
 * Live result of a CSS media query. For behaviour that CSS alone can't express
 * (which toolbar to render, ARIA orientation); prefer responsive classes for
 * pure styling. False where matchMedia is unavailable (jsdom).
 */
export function useMediaQuery(query: string): boolean {
  const [value, setValue] = useState(() => matches(query));
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const onChange = (): void => setValue(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return value;
}

export function useIsPhone(): boolean {
  return useMediaQuery(PHONE_QUERY);
}
