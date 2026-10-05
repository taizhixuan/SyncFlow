/** The comma-separated entries of a WEB_ORIGIN value, trimmed, blanks dropped. */
export function splitWebOrigins(raw: string): string[] {
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * One WEB_ORIGIN entry as the bare origin a browser sends (`scheme://host[:port]`,
 * lowercased, default port dropped), or null if it is not an http(s) URL.
 * CORS and TrustedOriginGuard compare the `Origin` header exactly, so a
 * configured trailing slash or path would otherwise reject the real web app.
 */
export function toWebOrigin(entry: string): string | null {
  let url: URL;
  try {
    url = new URL(entry);
  } catch {
    return null;
  }
  return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
}
