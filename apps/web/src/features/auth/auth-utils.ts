const FALLBACK = '/app';

// Backslashes (browsers treat `\` like `/`) and C0/DEL control characters (the
// URL parser silently strips tab/CR/LF) are how `/\evil.com` or `/<TAB>/evil.com`
// sneak past a naive "starts with a single slash" check.
// eslint-disable-next-line no-control-regex -- matching control chars is the point
const UNSAFE_CHARS = /[\\\u0000-\u001f\u007f]/;

function safeDecode(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

/**
 * Validate that a returnTo value is a safe internal path and normalise it to
 * `pathname + search + hash`, or null. Anything that could resolve off-origin —
 * absolute or protocol-relative URLs, backslash tricks, control characters (raw
 * or percent-encoded) — is rejected.
 */
export function parseReturnTo(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith('/')) return null;
  const decoded = safeDecode(raw);
  if (decoded === null) return null;
  // Check the decoded form too: `/%2F/evil.com` or `/%09/evil.com` become
  // dangerous once a router or the browser decodes them.
  for (const candidate of [raw, decoded]) {
    if (UNSAFE_CHARS.test(candidate) || candidate.startsWith('//')) return null;
  }

  let url: URL;
  try {
    url = new URL(raw, window.location.origin);
  } catch {
    return null;
  }
  if (url.origin !== window.location.origin) return null;
  const path = `${url.pathname}${url.search}${url.hash}`;
  return path.startsWith('//') ? null : path;
}

/** A safe internal path to go to after auth, defaulting to `/app`. */
export function safeReturnTo(raw: string | null | undefined): string {
  return parseReturnTo(raw) ?? FALLBACK;
}

/** `path`, carrying a (validated) returnTo along so auth cross-links keep it. */
export function withReturnTo(path: string, raw: string | null | undefined): string {
  const returnTo = parseReturnTo(raw);
  return returnTo ? `${path}?returnTo=${encodeURIComponent(returnTo)}` : path;
}
