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
  /** The linked site's own `/favicon.ico`, over https. */
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
    // The site the user pasted, not a third-party favicon service: routing
    // every pasted domain through Google told it what each board links to.
    faviconUrl: `https://${host}/favicon.ico`,
  };
}

/** Favicon hosts accepted besides the embed's own (legacy boards used Google's service). */
const FAVICON_SERVICE = { host: 'www.google.com', path: '/s2/favicons' };

const bareHost = (h: string): string => h.toLowerCase().replace(/^www\./, '');

/**
 * The embed's favicon URL if it is safe to load, else null.
 *
 * `faviconUrl` is peer-writable, and every viewer's browser fetches it: a
 * collaborator could point it at a tracking pixel and learn who opened the
 * board and when. Only https URLs on the embed's own host (ignoring `www.`),
 * or the favicon service older boards stored, are allowed.
 */
export function safeFaviconUrl(el: { url?: string; faviconUrl?: string }): string | null {
  if (!el.url || !el.faviconUrl) return null;
  let link: URL;
  let icon: URL;
  try {
    link = new URL(el.url);
    icon = new URL(el.faviconUrl);
  } catch {
    return null;
  }
  if (icon.protocol !== 'https:') return null;
  if (bareHost(icon.hostname) === bareHost(link.hostname)) return icon.href;
  if (icon.hostname === FAVICON_SERVICE.host && icon.pathname === FAVICON_SERVICE.path) return icon.href;
  return null;
}
