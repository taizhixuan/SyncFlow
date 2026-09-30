import { afterEach, describe, expect, it, vi } from 'vitest';
import indexHtml from '../../index.html?raw';
import { writeThemePreference } from '@/lib/ui-preferences';

/** The inline script in index.html that applies the theme before React mounts. */
function bootScript(): string {
  const match = /<script data-theme-boot>([\s\S]*?)<\/script>/.exec(indexHtml);
  if (!match?.[1]) throw new Error('index.html has no <script data-theme-boot> pre-paint script');
  return match[1];
}

function runBoot(prefersDark: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: prefersDark && query.includes('dark') }));
  new Function(bootScript())();
}

describe('pre-paint theme boot script', () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    vi.unstubAllGlobals();
  });

  it('applies a saved dark preference (the key ui-preferences writes)', () => {
    writeThemePreference('dark');
    runBoot(false);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('keeps a saved light preference over an OS dark preference', () => {
    writeThemePreference('light');
    runBoot(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('falls back to the OS preference when nothing is saved', () => {
    runBoot(true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});
