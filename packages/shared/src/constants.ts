/** API version segment, e.g. used to build `/api/v1`. */
export const API_VERSION = 'v1' as const;

/** Global REST prefix applied by the NestJS server. */
export const API_PREFIX = `api/${API_VERSION}` as const;

/** Presence palette — each collaborator is assigned one hue (see wireframes). */
export const PRESENCE_PALETTE = [
  '#3B5BFF', // cobalt
  '#FF5A5F', // coral
  '#FFB020', // amber
  '#12B5A5', // teal
  '#8B5CF6', // violet
  '#5BD15B', // lime
  '#E5489B', // magenta
  '#2BB3F0', // sky
] as const;
