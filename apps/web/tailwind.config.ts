import type { Config } from 'tailwindcss';

/**
 * SyncFlow design tokens (see planning/wireframes.md §2).
 * Color is functional: the `presence` palette identifies collaborators.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        paper: '#FBFBF9',
        raised: '#FFFFFF',
        sunken: '#F2F2EE',
        grid: '#E3E3DE',
        line: '#E7E7E2',
        ink: {
          DEFAULT: '#1A1A22',
          600: '#4B4B57',
          400: '#8A8A96',
        },
        // dark theme surfaces (used via dark: utilities)
        'paper-dark': '#14141A',
        'raised-dark': '#1E1E26',
        'sunken-dark': '#101015',
        'line-dark': '#2A2A33',
        'ink-dark': '#F4F4F2',
        brand: '#3B5BFF',
        success: '#12B5A5',
        warn: '#FFB020',
        danger: '#FF5A5F',
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
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        lg: '12px',
        md: '8px',
      },
      boxShadow: {
        raised: '0 1px 2px rgba(26,26,34,.06)',
        float: '0 8px 24px rgba(26,26,34,.12)',
      },
      backgroundImage: {
        'dot-grid': 'radial-gradient(circle, #E3E3DE 1px, transparent 1px)',
      },
      backgroundSize: {
        dots: '24px 24px',
      },
    },
  },
  plugins: [],
} satisfies Config;
