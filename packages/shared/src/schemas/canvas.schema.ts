import { z } from 'zod';

/** The kinds of element that can live on a board. */
export const ELEMENT_TYPES = [
  'rect',
  'ellipse',
  'line',
  'freehand',
  'sticky',
  'text',
  'diamond',
  'triangle',
  'star',
  'connector',
  'frame',
  'image',
  'code',
  'embed',
  'mindnode',
] as const;
export const elementTypeSchema = z.enum(ELEMENT_TYPES);
export type ElementType = z.infer<typeof elementTypeSchema>;

/** Either an explicit hex like '#3B5BFF' or the sentinel 'auto' (theme-resolved). */
export type ColorValue = string;

/**
 * A single canvas element. Deliberately FLAT (primitive fields, optional
 * shape-specific keys) rather than a discriminated union, so it maps cleanly
 * onto a Yjs Y.Map for conflict-free per-field updates in the sync phase.
 */
export const canvasElementSchema = z.object({
  id: z.string(),
  type: elementTypeSchema,
  x: z.number(),
  y: z.number(),
  rotation: z.number().default(0),
  opacity: z.number().min(0).max(1).default(1),
  zIndex: z.number().default(0),

  // styling
  fill: z.string().nullable().default(null),
  stroke: z.string().default('#1A1A22'),
  strokeWidth: z.number().nonnegative().default(2),

  // box-like shapes (rect, ellipse, sticky, text)
  width: z.number().optional(),
  height: z.number().optional(),

  // line / freehand: flat [x0,y0,x1,y1,...] relative to (x,y)
  points: z.array(z.number()).optional(),

  // text / sticky
  text: z.string().optional(),
  fontSize: z.number().optional(),

  // extended styling
  strokeStyle: z.enum(['solid', 'dashed', 'dotted']).default('solid'),
  cornerRadius: z.number().nonnegative().optional(),
  sketch: z.boolean().optional(),
  fontFamily: z.string().optional(),
  fontWeight: z.union([z.number(), z.string()]).optional(),
  italic: z.boolean().optional(),
  textAlign: z.enum(['left', 'center', 'right']).optional(),
  /**
   * Explicit text/label color. When set it wins for every text-bearing element
   * (text, sticky, shape labels, mind nodes). When unset, text falls back to a
   * theme/fill-aware default so labels stay legible (see resolveLabelColor).
   */
  textColor: z.string().optional(),
  locked: z.boolean().optional(),

  // connector (binding arrows)
  from: z
    .object({
      elementId: z.string().optional(),
      anchor: z.string().optional(),
      x: z.number().optional(),
      y: z.number().optional(),
    })
    .optional(),
  to: z
    .object({
      elementId: z.string().optional(),
      anchor: z.string().optional(),
      x: z.number().optional(),
      y: z.number().optional(),
    })
    .optional(),
  routing: z.enum(['straight', 'orthogonal', 'curved']).optional(),
  startArrow: z.boolean().optional(),
  endArrow: z.boolean().optional(),
  label: z.string().optional(),

  // frame (containers)
  name: z.string().optional(),
  children: z.array(z.string()).optional(),
  clip: z.boolean().optional(),

  // image / code / embed
  assetUrl: z.string().optional(),
  naturalWidth: z.number().optional(),
  naturalHeight: z.number().optional(),
  language: z.string().optional(),
  url: z.string().optional(),
  title: z.string().optional(),
  faviconUrl: z.string().optional(),

  // mind-map nodes
  parentId: z.string().optional(),
  collapsed: z.boolean().optional(),

  // grouping — elements sharing a groupId move/select together
  groupId: z.string().optional(),

  // collab annotations (authored locally now)
  tags: z.array(z.string()).optional(),

  // authoring metadata (used by presence-aware features later)
  createdBy: z.string().optional(),

  // markdown rendering — when true the text element renders parsed markdown blocks
  markdown: z.boolean().optional(),

  // collaborative voting & reactions (M4 — per-field Yjs sync, no server change)
  /** userId → dot count (multi-dot voting; absent/0 = no votes). */
  votes: z.record(z.string(), z.number()).optional(),
  /** emoji → userId[] (who reacted with that emoji). */
  reactions: z.record(z.string(), z.array(z.string())).optional(),
});
export type CanvasElement = z.infer<typeof canvasElementSchema>;

/** Partial patch applied to an existing element. */
export type CanvasElementPatch = Partial<Omit<CanvasElement, 'id' | 'type'>>;
