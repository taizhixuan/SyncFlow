/** Append the page query to a list path; the cursor is opaque, so encode it verbatim. */
export function pagedPath(path: string, limit: number, cursor: string | null | undefined): string {
  const query = `limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
  return `${path}?${query}`;
}
