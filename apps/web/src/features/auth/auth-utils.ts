/**
 * Validate that a returnTo value is a safe internal path.
 *
 * Accepts paths that start with `/` but NOT `//` (which browsers interpret
 * as a protocol-relative URL and could redirect off-site).
 */
export function safeReturnTo(raw: string | null | undefined): string {
  if (raw && raw.startsWith('/') && !raw.startsWith('//')) {
    return raw;
  }
  return '/app';
}
