// Generates docs/index.html — the GitHub Pages landing page that links the four
// documentation sub-sites. Run after `pnpm docs` (it is part of the aggregate).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(repoRoot, 'docs');

// Lucide line icons (https://lucide.dev) — one visual language, 1.75 stroke,
// currentColor so the gradient chip drives the color. No emoji as icons.
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
    blurb: 'The Zod schemas and TypeScript types shared across the network boundary by web and api.',
  },
  {
    href: './rest/',
    title: 'REST API',
    tool: 'OpenAPI · Redoc',
    icon: icons.server,
    blurb: 'Every HTTP endpoint (auth, boards, membership, invites, storage), generated from the live DTOs.',
  },
  {
    href: './api-structure/',
    title: 'API Structure',
    tool: 'Compodoc',
    icon: icons.fork,
    blurb: 'The NestJS application map: modules, controllers, providers, and the dependency-injection graph.',
  },
  {
    href: './components/',
    title: 'Components',
    tool: 'Storybook',
    icon: icons.grid,
    blurb: 'The React component catalog with live, interactive controls for each variant and state.',
  },
];

// SyncFlow logo mark (mirrors apps/web/src/components/logo-mark.tsx) — used as
// the favicon and the header glyph so the docs site carries the brand.
const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" role="img" aria-label="SyncFlow">
  <defs>
    <linearGradient id="sf-logo-grad" x1="23" y1="8" x2="9" y2="24" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#3B5BFF" />
      <stop offset="1" stop-color="#9B5BFF" />
    </linearGradient>
  </defs>
  <rect width="32" height="32" rx="7.5" fill="#13131B" />
  <path d="M23 11 C23 7 16 6 13 9 C10 12 13 15 16 16 C19 17 22 20 19 23 C16 26 9 25 9 21" fill="none" stroke="url(#sf-logo-grad)" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" />
  <circle cx="23" cy="11" r="2.1" fill="#3B5BFF" />
  <circle cx="9" cy="21" r="2.1" fill="#9B5BFF" />
</svg>
`;

const cards = sections
  .map(
    (s) => `      <a class="card" href="${s.href}">
        <span class="icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${s.icon}</svg>
        </span>
        <span class="tool">${s.tool}</span>
        <h2>${s.title}</h2>
        <p>${s.blurb}</p>
        <span class="go">Open<svg class="arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg></span>
      </a>`,
  )
  .join('\n');

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SyncFlow Documentation</title>
    <meta name="description" content="Generated reference for SyncFlow: API contracts, REST surface, application structure, and component catalog." />
    <link rel="icon" type="image/svg+xml" href="./logo.svg" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600&display=swap"
      rel="stylesheet"
    />
    <style>
      :root {
        color-scheme: dark;
        --bg: #0a0e1a;
        --fg: #f1f5f9;
        --muted: #9aa6bc;
        --card: #111726;
        --card-hover: #161d30;
        --border: #1f2740;
        --border-hover: #6366f1;
        --accent: #a5b4fc;
        --grad-a: #3b5bff;
        --grad-b: #9b5bff;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100dvh;
        font-family: 'IBM Plex Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
        color: var(--fg);
        background-color: var(--bg);
        background-image:
          radial-gradient(1100px 560px at 78% -12%, rgba(99, 102, 241, 0.2), transparent 60%),
          radial-gradient(900px 520px at 8% 4%, rgba(155, 91, 255, 0.12), transparent 55%),
          radial-gradient(circle, rgba(148, 163, 184, 0.045) 1px, transparent 1px);
        background-size: auto, auto, 24px 24px;
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: clamp(2.5rem, 6vw, 5rem) 1.25rem;
      }
      .wrap { width: 100%; max-width: 60rem; }
      .brand {
        display: inline-flex;
        align-items: center;
        gap: 0.6rem;
        font-weight: 600;
        font-size: 1rem;
        letter-spacing: -0.01em;
      }
      .brand .logo { display: block; width: 26px; height: 26px; border-radius: 7px; }
      h1 {
        font-size: clamp(2.25rem, 6vw, 3.5rem);
        line-height: 1.05;
        margin: 1.5rem 0 0.75rem;
        letter-spacing: -0.035em;
        font-weight: 700;
      }
      .lede { margin: 0 0 2.75rem; color: var(--muted); font-size: 1.075rem; line-height: 1.6; max-width: 42rem; }
      .grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 1.1rem;
      }
      @media (min-width: 640px) { .grid { grid-template-columns: 1fr 1fr; } }
      .card {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: 0.55rem;
        padding: 1.6rem;
        border-radius: 1rem;
        background: var(--card);
        border: 1px solid var(--border);
        text-decoration: none;
        color: inherit;
        overflow: hidden;
        transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
      }
      .card::before {
        content: '';
        position: absolute;
        inset: 0 0 auto 0;
        height: 2px;
        background: linear-gradient(90deg, var(--grad-a), var(--grad-b));
        opacity: 0;
        transition: opacity 0.2s ease;
      }
      .card:hover {
        transform: translateY(-4px);
        border-color: var(--border-hover);
        background: var(--card-hover);
        box-shadow: 0 16px 40px -20px rgba(99, 102, 241, 0.6);
      }
      .card:hover::before { opacity: 1; }
      .card:focus-visible {
        outline: 2px solid var(--border-hover);
        outline-offset: 3px;
      }
      .icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 2.75rem;
        height: 2.75rem;
        border-radius: 0.7rem;
        margin-bottom: 0.35rem;
        color: #fff;
        background: linear-gradient(135deg, var(--grad-a), var(--grad-b));
        box-shadow: 0 6px 18px -6px rgba(99, 102, 241, 0.7);
      }
      .icon svg { width: 1.4rem; height: 1.4rem; }
      .tool {
        font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 0.72rem;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: var(--accent);
        font-weight: 600;
      }
      .card h2 { margin: 0; font-size: 1.3rem; letter-spacing: -0.015em; font-weight: 600; }
      .card p { margin: 0; color: var(--muted); font-size: 0.94rem; line-height: 1.55; flex: 1; }
      .go {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        margin-top: 0.4rem;
        color: var(--accent);
        font-size: 0.92rem;
        font-weight: 600;
      }
      .go .arrow { width: 1rem; height: 1rem; transition: transform 0.2s ease; }
      .card:hover .go .arrow { transform: translateX(4px); }
      footer { margin-top: 3rem; color: var(--muted); font-size: 0.85rem; line-height: 1.6; }
      footer a { color: var(--accent); text-decoration: none; }
      footer a:hover { text-decoration: underline; }
      footer code {
        font-family: 'JetBrains Mono', ui-monospace, monospace;
        font-size: 0.82em;
        color: #cbd5e1;
        background: rgba(148, 163, 184, 0.12);
        padding: 0.1rem 0.4rem;
        border-radius: 0.3rem;
      }
      @media (prefers-reduced-motion: reduce) {
        .card, .card .arrow, .card::before { transition: none; }
        .card:hover { transform: none; }
        .card:hover .go .arrow { transform: none; }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <header>
        <div class="brand"><img class="logo" src="./logo.svg" width="26" height="26" alt="" /> SyncFlow</div>
        <h1>Documentation</h1>
        <p class="lede">Generated reference for SyncFlow, the real-time collaborative whiteboard. Each section is produced directly from the source, so it never drifts from the code.</p>
      </header>
      <main class="grid">
${cards}
      </main>
      <footer>
        Built from the <code>pnpm run docs</code> pipeline. Source: <a href="https://github.com/taizhixuan/SyncFlow">github.com/taizhixuan/SyncFlow</a> · Live app: <a href="https://syncflows.xyz">syncflows.xyz</a>
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
