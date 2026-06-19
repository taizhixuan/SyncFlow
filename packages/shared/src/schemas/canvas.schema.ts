import { z } from 'zod';

/** The kinds of element that can live on a board. */
export const ELEMENT_TYPES = ['rect', 'ellipse', 'line', 'freehand', 'sticky', 'text'] as const;
export const elementTypeSchema = z.enum(ELEMENT_TYPES);
export type ElementType = z.infer<typeof elementTypeSchema>;

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

  // authoring metadata (used by presence-aware features later)
  createdBy: z.string().optional(),
});
export type CanvasElement = z.infer<typeof canvasElementSchema>;

/** Partial patch applied to an existing element. */
export type CanvasElementPatch = Partial<Omit<CanvasElement, 'id' | 'type'>>;
