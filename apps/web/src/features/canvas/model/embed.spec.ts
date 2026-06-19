/**
 * TDD spec for the deriveEmbed pure helper.
 * Written BEFORE the implementation — these tests must fail first, then pass.
 */
import { describe, expect, it } from 'vitest';
import { deriveEmbed } from './embed';

describe('deriveEmbed', () => {
  it('returns url, title (hostname) and faviconUrl for a valid https URL', () => {
    const result = deriveEmbed('https://github.com/Httpsouls/SyncFlow');
    expect(result).not.toBeNull();
    expect(result!.url).toBe('https://github.com/Httpsouls/SyncFlow');
    expect(result!.title).toBe('github.com');
    expect(result!.faviconUrl).toBe('https://www.google.com/s2/favicons?domain=github.com&sz=64');
  });

  it('strips www. prefix from title', () => {
    const result = deriveEmbed('https://www.example.com/page');
    expect(result).not.toBeNull();
    expect(result!.title).toBe('example.com');
    expect(result!.faviconUrl).toBe('https://www.google.com/s2/favicons?domain=example.com&sz=64');
  });

  it('prepends https:// when protocol is missing and returns a valid result', () => {
    const result = deriveEmbed('google.com/search?q=test');
    expect(result).not.toBeNull();
    expect(result!.url).toBe('https://google.com/search?q=test');
    expect(result!.title).toBe('google.com');
    expect(result!.faviconUrl).toBe('https://www.google.com/s2/favicons?domain=google.com&sz=64');
  });

  it('handles bare hostnames without a path', () => {
    const result = deriveEmbed('notion.so');
    expect(result).not.toBeNull();
    expect(result!.title).toBe('notion.so');
  });

  it('returns null for an empty string', () => {
    expect(deriveEmbed('')).toBeNull();
  });

  it('returns null for a plain word that is not a URL', () => {
    expect(deriveEmbed('hello world')).toBeNull();
  });

  it('returns null for a string that cannot be parsed as a URL even with https:// prepended', () => {
    // Spaces in the middle prevent valid URL parsing
    expect(deriveEmbed('not a url at all')).toBeNull();
  });

  it('handles http:// URLs', () => {
    const result = deriveEmbed('http://example.org/path');
    expect(result).not.toBeNull();
    expect(result!.title).toBe('example.org');
    expect(result!.faviconUrl).toBe('https://www.google.com/s2/favicons?domain=example.org&sz=64');
  });

  it('uses the raw host (without www.) for faviconUrl domain', () => {
    const result = deriveEmbed('https://www.figma.com/file/123');
    expect(result!.faviconUrl).toBe('https://www.google.com/s2/favicons?domain=figma.com&sz=64');
  });
});
