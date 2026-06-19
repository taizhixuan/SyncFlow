export type Theme = 'light' | 'dark';
export const AUTO = 'auto';

export const THEME_INK: Record<Theme, string> = { light: '#1A1A22', dark: '#F4F4F2' };

/** Stroke/text color: 'auto' follows the theme ink; anything else is literal. */
export function resolveStroke(value: string, theme: Theme): string {
  return value === AUTO ? THEME_INK[theme] : value;
}

/** Fill: 'auto' and null mean transparent; an explicit hex is literal. */
export function resolveFill(value: string | null | undefined, theme: Theme): string | undefined {
  void theme;
  if (value == null || value === AUTO) return undefined;
  return value;
}

/**
 * Link color for markdown-rendered hyperlinks.
 * Cobalt blue (#3B82F6) is vivid and accessible on both light and dark canvas
 * backgrounds per the design spec, so both themes return the same cobalt value.
 * The function is theme-aware so future theme splits (e.g. higher-contrast dark
 * cobalt) can be introduced here without touching any renderer.
 */
export function resolveLinkColor(theme: Theme): string {
  const LINK_COBALT: Record<Theme, string> = { light: '#3B82F6', dark: '#3B82F6' };
  return LINK_COBALT[theme];
}
