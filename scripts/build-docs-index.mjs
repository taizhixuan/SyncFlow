// Generates docs/index.html — the GitHub Pages landing page that links the four
// documentation sub-sites. Run after `pnpm docs` (it is part of the aggregate).
// Styled with the web app's "Midnight" tokens (apps/web/src/styles/index.css) so
// the docs read as part of the product, in both the dark and the light theme.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(repoRoot, 'docs');
const REPO_URL = 'https://github.com/taizhixuan/SyncFlow';

/** The commit the docs were built from, so the page shows how fresh it is. */
function buildStamp() {
  const sha =
    process.env.GITHUB_SHA ??
    (() => {
      try {
        return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot }).toString().trim();
      } catch {
        return '';
      }
    })();
  const date = new Date().toISOString().slice(0, 10);
  return { sha, short: sha.slice(0, 7), date };
}
const stamp = buildStamp();

// Lucide line icons (https://lucide.dev): one visual language, 1.75 stroke,
// currentColor so the chip drives the colour. No emoji as icons.
const icons = {
  braces:
    '<path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1"/><path d="M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"/>',
  server:
    '<rect width="20" height="8" x="2" y="2" rx="2"/><rect width="20" height="8" x="2" y="14" rx="2"/><path d="M6 6h.01"/><path d="M6 18h.01"/>',
  fork:
    '<circle cx="12" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><path d="M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9"/><path d="M12 12v3"/>',
  grid:
    '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
};

const sections = [
  {
    href: './reference/',
    title: 'Shared Contracts',
    tool: 'TypeDoc',
    icon: icons.braces,
    blurb: 'The Zod schemas and TypeScript types the web app and the API share across the network boundary.',
  },
  {
    href: './rest/',
    title: 'REST API',
    tool: 'OpenAPI · Redoc',
    icon: icons.server,
    blurb: 'Every HTTP endpoint (auth, boards, members, invites, uploads, history), generated from the code.',
  },
  {
    href: './api-structure/',
    title: 'API Structure',
    tool: 'Compodoc',
    icon: icons.fork,
    blurb: 'The NestJS application map: modules, controllers, providers and the dependency graph.',
  },
  {
    href: './components/',
    title: 'Components',
    tool: 'Storybook',
    icon: icons.grid,
    blurb: 'The React component catalog, including the editor shell, inspector and command palette.',
  },
];

// SyncFlow logo mark (mirrors apps/web/src/components/logo-mark.tsx): ink on
// lime, legible on both themes. Used as the favicon and the header glyph.
const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" role="img" aria-label="SyncFlow">
  <rect width="32" height="32" rx="8" fill="#C8F04A" />
  <path d="M23 11 C23 7 16 6 13 9 C10 12 13 15 16 16 C19 17 22 20 19 23 C16 26 9 25 9 21" fill="none" stroke="#0B0B0E" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" />
  <circle cx="23" cy="11" r="2.1" fill="#0B0B0E" />
  <circle cx="9" cy="21" r="2.1" fill="#0B0B0E" />
</svg>
`;

const cards = sections
  .map(
    (s) => `      <a class="card" href="${s.href}">
        <span class="top">
          <span class="icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${s.icon}</svg>
          </span>
          <span class="tool">${s.tool}</span>
        </span>
        <h2>${s.title}</h2>
        <p>${s.blurb}</p>
        <span class="go">Open<svg class="arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg></span>
      </a>`,
  )
  .join('\n');

const built = stamp.sha
  ? `Built from <a href="${REPO_URL}/commit/${stamp.sha}"><code>${stamp.short}</code></a> on ${stamp.date}`
  : `Built on ${stamp.date}`;

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SyncFlow Documentation</title>
    <meta name="description" content="Generated reference for SyncFlow: shared contracts, REST API, application structure and component catalog." />
    <meta name="theme-color" content="#0E0E12" media="(prefers-color-scheme: dark)" />
    <meta name="theme-color" content="#FFFFFF" media="(prefers-color-scheme: light)" />
    <link rel="icon" type="image/svg+xml" href="./logo.svg" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@500&display=swap"
      rel="stylesheet"
    />
    <style>
      /* Midnight tokens, light first; dark follows the OS. */
      :root {
        color-scheme: light dark;
        --paper: #f5f5f7;
        --chrome: #ffffff;
        --raised: #ffffff;
        --sunken: #f0f0f3;
        --line: #e4e4e9;
        --line-strong: #d0d0d8;
        --ink: #111114;
        --ink-600: #45454f;
        --ink-400: #6a6a76;
        --dots: #ceced6;
        --accent: #c8f04a;
        --on-accent: #0b0b0e;
        --brand: #4d6b00;
        --shadow: 0 1px 2px rgb(17 17 20 / 0.06), 0 12px 32px -12px rgb(17 17 20 / 0.22);
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --paper: #0b0b0e;
          --chrome: #0e0e12;
          --raised: #141419;
          --sunken: #1c1c22;
          --line: #23232a;
          --line-strong: #34343d;
          --ink: #ededf0;
          --ink-600: #b2b2bd;
          --ink-400: #8c8c99;
          --dots: #282830;
          --brand: #c8f04a;
          --shadow: 0 0 0 1px rgb(255 255 255 / 0.04), 0 16px 40px -12px rgb(0 0 0 / 0.7);
        }
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100dvh;
        font-family: 'Instrument Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
        color: var(--ink);
        background-color: var(--paper);
        background-image: radial-gradient(circle, var(--dots) 1px, transparent 1.3px);
        background-size: 20px 20px;
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: clamp(2.5rem, 6vw, 5rem) 1rem;
        -webkit-font-smoothing: antialiased;
      }
      .wrap { width: 100%; max-width: 60rem; }
      .brand {
        display: inline-flex;
        align-items: center;
        gap: 0.6rem;
        font-weight: 600;
        letter-spacing: -0.01em;
        color: var(--ink);
        text-decoration: none;
      }
      .brand .logo { display: block; width: 28px; height: 28px; }
      .eyebrow {
        margin: 2.25rem 0 0;
        font-family: 'JetBrains Mono', ui-monospace, monospace;
        font-size: 0.72rem;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--brand);
      }
      h1 {
        font-size: clamp(2.4rem, 6vw, 3.6rem);
        line-height: 1.02;
        margin: 0.75rem 0 0.9rem;
        letter-spacing: -0.04em;
        font-weight: 600;
      }
      .lede { margin: 0 0 2.5rem; color: var(--ink-600); font-size: 1.05rem; line-height: 1.6; max-width: 40rem; }
      .lede code { font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 0.85em; background: var(--sunken); border: 1px solid var(--line); border-radius: 4px; padding: 0.05rem 0.3rem; }
      .grid { display: grid; grid-template-columns: 1fr; gap: 1rem; }
      @media (min-width: 640px) { .grid { grid-template-columns: 1fr 1fr; } }
      .card {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        padding: 1.4rem;
        border-radius: 12px;
        background: var(--raised);
        border: 1px solid var(--line);
        text-decoration: none;
        color: inherit;
        transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
      }
      .card:hover { transform: translateY(-2px); border-color: var(--line-strong); box-shadow: var(--shadow); }
      .card:focus-visible { outline: 2px solid var(--brand); outline-offset: 3px; }
      .top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.4rem; }
      .icon {
        display: inline-grid;
        place-items: center;
        width: 2.5rem;
        height: 2.5rem;
        border-radius: 9px;
        color: var(--on-accent);
        background: var(--accent);
      }
      .icon svg { width: 1.25rem; height: 1.25rem; }
      .tool {
        font-family: 'JetBrains Mono', ui-monospace, monospace;
        font-size: 0.7rem;
        color: var(--ink-400);
        border: 1px solid var(--line);
        background: var(--sunken);
        border-radius: 5px;
        padding: 0.15rem 0.45rem;
      }
      .card h2 { margin: 0; font-size: 1.2rem; letter-spacing: -0.015em; font-weight: 600; }
      .card p { margin: 0; color: var(--ink-400); font-size: 0.93rem; line-height: 1.55; flex: 1; }
      .go {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        margin-top: 0.5rem;
        color: var(--brand);
        font-size: 0.9rem;
        font-weight: 600;
      }
      .go .arrow { width: 1rem; height: 1rem; transition: transform 0.15s ease; }
      .card:hover .go .arrow { transform: translateX(3px); }
      .links { display: flex; flex-wrap: wrap; gap: 0.6rem; margin-top: 1.5rem; }
      .links a {
        display: inline-flex;
        align-items: center;
        height: 2.25rem;
        padding: 0 0.9rem;
        border-radius: 8px;
        border: 1px solid var(--line);
        background: var(--raised);
        color: var(--ink);
        font-size: 0.9rem;
        font-weight: 500;
        text-decoration: none;
      }
      .links a.primary { background: var(--accent); border-color: var(--accent); color: var(--on-accent); font-weight: 600; }
      .links a:hover { border-color: var(--line-strong); }
      footer {
        margin-top: 2.5rem;
        padding-top: 1.25rem;
        border-top: 1px solid var(--line);
        color: var(--ink-400);
        font-family: 'JetBrains Mono', ui-monospace, monospace;
        font-size: 0.78rem;
        line-height: 1.7;
      }
      footer a { color: var(--ink-600); }
      footer code { font: inherit; color: var(--ink); }
      @media (prefers-reduced-motion: reduce) {
        .card, .go .arrow { transition: none; }
        .card:hover, .card:hover .go .arrow { transform: none; }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <header>
        <a class="brand" href="${REPO_URL}"><img class="logo" src="./logo.svg" width="28" height="28" alt="" /> SyncFlow</a>
        <p class="eyebrow">Reference · generated from source</p>
        <h1>Documentation</h1>
        <p class="lede">Reference for SyncFlow, the real-time collaborative whiteboard. Every section is generated from the code on each push to <code>main</code>, so it never drifts from what is running.</p>
      </header>
      <main class="grid">
${cards}
      </main>
      <nav class="links" aria-label="More">
        <a class="primary" href="https://syncflows.xyz">Open the app</a>
        <a href="${REPO_URL}">Source on GitHub</a>
        <a href="${REPO_URL}#readme">README</a>
      </nav>
      <footer>
        ${built} · <code>pnpm run docs</code> · MIT licensed
      </footer>
    </div>
  </body>
</html>
`;

mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, 'index.html'), html);
writeFileSync(resolve(outDir, 'logo.svg'), logoSvg);
// Stop GitHub Pages' Jekyll processor from ignoring folders that start with "_".
writeFileSync(resolve(outDir, '.nojekyll'), '');
console.log('Docs landing page written to docs/index.html');
