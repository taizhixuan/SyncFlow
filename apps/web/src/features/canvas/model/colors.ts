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
