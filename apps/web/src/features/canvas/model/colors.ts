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

/** Relative luminance (0..1) of a #rgb/#rrggbb color; non-hex inputs return 1 (treated as light). */
export function luminance(color: string): number {
  let hex = color.trim().replace('#', '');
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  if (hex.length !== 6 || /[^0-9a-fA-F]/.test(hex)) return 1;
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  // Perceptual weighting (Rec. 601) — good enough for ink/paper contrast picking.
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Pick the more legible ink (dark vs light) to sit on top of a background color. */
export function readableInk(background: string): string {
  return luminance(background) > 0.55 ? THEME_INK.light : THEME_INK.dark;
}

/**
 * Resolve the color for a text label rendered *on top of a shape*.
 * Priority: an explicit `textColor` wins; otherwise contrast against the shape's
 * own fill when it has one; otherwise fall back to the theme ink so text on a
 * transparent shape stays legible against the canvas background. This is what
 * keeps a light sticky's label dark even in dark mode (no white-on-white).
 */
export function resolveLabelColor(
  textColor: string | null | undefined,
  fill: string | null | undefined,
  theme: Theme,
): string {
  if (textColor && textColor !== AUTO) return textColor;
  const resolvedFill = resolveFill(fill, theme);
  if (resolvedFill) return readableInk(resolvedFill);
  return THEME_INK[theme];
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

/**
 * Default border and fill colors for mindnode elements.
 * Indigo (#6366F1) border + an indigo tint fill, both theme-aware.
 * The renderer uses these when el.stroke / el.fill is unset or 'auto'.
 */
export const MINDNODE_DEFAULT_BORDER = '#6366F1';
export const MINDNODE_DEFAULT_FILL: Record<Theme, { normal: string; collapsed: string }> = {
  light: { normal: '#EEF2FF', collapsed: '#E0E7FF' },
  dark: { normal: '#2D2D3A', collapsed: '#3D3D50' },
};

/**
 * Resolve the border color for a mindnode.
 * Explicit stroke (not 'auto') → resolveStroke passthrough; otherwise the default indigo.
 */
export function resolveMindNodeBorder(stroke: string, theme: Theme): string {
  if (stroke && stroke !== AUTO) return resolveStroke(stroke, theme);
  return MINDNODE_DEFAULT_BORDER;
}

/**
 * Resolve the fill color for a mindnode.
 * Explicit fill (not 'auto'/null) → literal; otherwise the theme-aware indigo tint.
 */
export function resolveMindNodeFill(
  fill: string | null | undefined,
  theme: Theme,
  collapsed: boolean,
): string {
  if (fill != null && fill !== AUTO) return fill;
  return collapsed ? MINDNODE_DEFAULT_FILL[theme].collapsed : MINDNODE_DEFAULT_FILL[theme].normal;
}

/**
 * Edge color for mind-map connector lines.
 * Indigo violet — lighter in dark mode for contrast, standard in light.
 */
export function resolveMindEdgeColor(theme: Theme): string {
  const MIND_EDGE: Record<Theme, string> = { light: '#6366F1', dark: '#818CF8' };
  return MIND_EDGE[theme];
}

/**
 * Frame border stroke color.
 * Subtle container border — semi-transparent neutral, theme-aware.
 * If el.stroke is explicit (not 'auto'), resolveStroke is used instead
 * so recolorSelection works on frames.
 */
export function resolveFrameBorder(stroke: string, theme: Theme): string {
  if (stroke && stroke !== AUTO) return resolveStroke(stroke, theme);
  return theme === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)';
}

/**
 * Frame background fill — near-invisible tint so frames are visually distinct
 * without competing with canvas content.
 */
export function resolveFrameFill(theme: Theme): string {
  return theme === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)';
}

/**
 * Vote badge fill color — brand blue used for the dot-vote circle badge.
 * Slightly brighter in dark mode for contrast against the dark canvas surface.
 */
export function resolveVoteColor(theme: Theme): string {
  const VOTE_BLUE: Record<Theme, string> = { light: '#3B5BFF', dark: '#6B8BFF' };
  return VOTE_BLUE[theme];
}

/**
 * Top-vote glow color — gold highlight rendered around the top-voted elements
 * in voting mode. Slightly desaturated in dark mode to avoid harsh glare.
 */
export function resolveTopVoteGlow(theme: Theme): string {
  const VOTE_GLOW: Record<Theme, string> = { light: '#FFC300', dark: '#FFD452' };
  return VOTE_GLOW[theme];
}
