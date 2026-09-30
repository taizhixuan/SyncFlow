/**
 * TDD spec for the deriveEmbed pure helper.
 * Written BEFORE the implementation — these tests must fail first, then pass.
 */
import { describe, expect, it } from 'vitest';
import { deriveEmbed, safeFaviconUrl } from './embed';

describe('deriveEmbed', () => {
  it('returns url, title (hostname) and faviconUrl for a valid https URL', () => {
    const result = deriveEmbed('https://github.com/Httpsouls/SyncFlow');
    expect(result).not.toBeNull();
    expect(result!.url).toBe('https://github.com/Httpsouls/SyncFlow');
    expect(result!.title).toBe('github.com');
    expect(result!.faviconUrl).toBe('https://github.com/favicon.ico');
  });

  it('strips www. prefix from title', () => {
    const result = deriveEmbed('https://www.example.com/page');
    expect(result).not.toBeNull();
    expect(result!.title).toBe('example.com');
    expect(result!.faviconUrl).toBe('https://www.example.com/favicon.ico');
  });

  it('prepends https:// when protocol is missing and returns a valid result', () => {
    const result = deriveEmbed('google.com/search?q=test');
    expect(result).not.toBeNull();
    expect(result!.url).toBe('https://google.com/search?q=test');
    expect(result!.title).toBe('google.com');
    expect(result!.faviconUrl).toBe('https://google.com/favicon.ico');
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
    expect(result!.faviconUrl).toBe('https://example.org/favicon.ico');
  });

  it('asks the linked site itself for its favicon, never a third party', () => {
    const result = deriveEmbed('https://www.figma.com/file/123');
    expect(result!.faviconUrl).toBe('https://www.figma.com/favicon.ico');
  });
});

describe('safeFaviconUrl', () => {
  it('accepts an https favicon on the embed host', () => {
    expect(safeFaviconUrl({ url: 'https://github.com/x', faviconUrl: 'https://github.com/favicon.ico' }))
      .toBe('https://github.com/favicon.ico');
  });

  it('ignores a www. difference between the link and the favicon host', () => {
    expect(safeFaviconUrl({ url: 'https://www.figma.com/f', faviconUrl: 'https://figma.com/favicon.ico' }))
      .toBe('https://figma.com/favicon.ico');
  });

  it("swaps a legacy Google favicon URL for the site's own favicon", () => {
    const legacy = 'https://www.google.com/s2/favicons?domain=github.com&sz=64';
    expect(safeFaviconUrl({ url: 'https://github.com/x', faviconUrl: legacy })).toBe(
      'https://github.com/favicon.ico',
    );
  });

  it('never loads a peer-set tracking pixel on another host', () => {
    expect(
      safeFaviconUrl({ url: 'https://github.com', faviconUrl: 'https://tracker.example/p.gif?u=1' }),
    ).toBe('https://github.com/favicon.ico');
  });

  it('never loads a non-https favicon', () => {
    expect(safeFaviconUrl({ url: 'http://github.com', faviconUrl: 'http://github.com/favicon.ico' })).toBeNull();
    expect(safeFaviconUrl({ url: 'https://github.com', faviconUrl: 'javascript:alert(1)' })).toBe(
      'https://github.com/favicon.ico',
    );
  });

  it('rejects when either url is missing or malformed', () => {
    expect(safeFaviconUrl({ url: 'https://github.com' })).toBeNull();
    expect(safeFaviconUrl({ url: 'nope', faviconUrl: 'https://nope/favicon.ico' })).toBeNull();
  });
});
