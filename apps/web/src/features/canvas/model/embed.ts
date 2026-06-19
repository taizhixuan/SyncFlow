/**
 * Pure helpers for embed (link-preview card) elements.
 *
 * No runtime deps beyond native URL parsing. All logic is side-effect-free
 * so it is safe to unit-test without a DOM environment.
 */

export interface EmbedMeta {
  /** The canonical URL (protocol guaranteed). */
  url: string;
  /** Human-readable title — hostname with www. stripped. */
  title: string;
  /** Google favicon service URL (64 px) for the host. */
  faviconUrl: string;
}

/**
 * Derive embed metadata from a raw URL string.
 *
 * - If the input lacks a protocol (http:// or https://) we prepend https://.
 * - If the result still cannot be parsed as a URL, returns null.
 * - Invalid/non-URL strings (spaces, plain words) return null.
 */
export function deriveEmbed(raw: string): EmbedMeta | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Reject strings with internal spaces before any protocol fix — they can
  // never be a valid URL and URL() would throw/mangle them.
  if (/\s/.test(trimmed)) return null;

  let candidate = trimmed;
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }

  // URL must have a meaningful hostname (not just an empty string or bare path)
  if (!parsed.hostname || !parsed.hostname.includes('.')) return null;

  const host = parsed.hostname; // e.g. "www.github.com"
  const displayHost = host.replace(/^www\./i, ''); // strip leading www.

  return {
    url: candidate,
    title: displayHost,
    faviconUrl: `https://www.google.com/s2/favicons?domain=${displayHost}&sz=64`,
  };
}
