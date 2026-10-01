import type { Config } from 'tailwindcss';

/**
 * SyncFlow "Midnight" design tokens (see planning/wireframes.md §2).
 *
 * Every surface/ink color is a CSS variable (RGB channels, so Tailwind's `/opacity`
 * modifiers still work) defined per theme in `src/styles/index.css`. The legacy
 * `*-dark` names resolve to the same variables, so an old `bg-raised
 * dark:bg-raised-dark` pair is simply the same token twice and can be dropped as
 * code is touched. Color is functional: `accent` is the one brand fill, and the
 * `presence` palette identifies collaborators.
 */
const v = (name: string): string => `rgb(var(--sf-${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        paper: v('paper'),
        chrome: v('chrome'),
        raised: v('raised'),
        sunken: v('sunken'),
        grid: v('dots'),
        line: { DEFAULT: v('line'), strong: v('line-strong') },
        ink: {
          DEFAULT: v('ink'),
          600: v('ink-600'),
          400: v('ink-400'),
          300: v('ink-400'),
        },
        'paper-dark': v('paper'),
        'raised-dark': v('raised'),
        'sunken-dark': v('sunken'),
        'line-dark': v('line'),
        'ink-dark': v('ink'),
        // `accent` is the lime fill (always paired with `on-accent` text);
        // `brand` is the accent as a foreground — text, rings, outlines — which
        // has to darken to olive on light surfaces to stay legible.
        accent: v('accent'),
        'on-accent': v('on-accent'),
        brand: v('accent-ink'),
        success: v('success'),
        warn: v('warn'),
        danger: v('danger'),
        presence: {
          cobalt: '#3B5BFF',
          coral: '#FF5A5F',
          amber: '#FFB020',
          teal: '#12B5A5',
          violet: '#8B5CF6',
          lime: '#5BD15B',
          magenta: '#E5489B',
          sky: '#2BB3F0',
        },
      },
      fontFamily: {
        display: ['"Instrument Sans"', 'system-ui', 'sans-serif'],
        sans: ['"Instrument Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        lg: '12px',
        md: '8px',
      },
      boxShadow: {
        raised: 'var(--sf-shadow-raised)',
        float: 'var(--sf-shadow-float)',
      },
      backgroundImage: {
        'dot-grid': 'radial-gradient(circle, rgb(var(--sf-dots)) 1px, transparent 1.3px)',
      },
      backgroundSize: {
        dots: '20px 20px',
      },
    },
  },
  plugins: [],
} satisfies Config;
