// Generates docs/index.html — the GitHub Pages landing page that links the four
// documentation sub-sites. Run after `pnpm docs` (it is part of the aggregate).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(repoRoot, 'docs');

const sections = [
  {
    href: './reference/',
    title: 'Shared Contracts',
    tool: 'TypeDoc',
    blurb: 'The Zod schemas and TypeScript types shared across the network boundary by web and api.',
  },
  {
    href: './rest/',
    title: 'REST API',
    tool: 'OpenAPI · Redoc',
    blurb: 'Every HTTP endpoint — auth, boards, membership, invites, storage — generated from the live DTOs.',
  },
  {
    href: './api-structure/',
    title: 'API Structure',
    tool: 'Compodoc',
    blurb: 'The NestJS application map: modules, controllers, providers, and the dependency-injection graph.',
  },
  {
    href: './components/',
    title: 'Components',
    tool: 'Storybook',
    blurb: 'The React component catalog with live, interactive controls for each variant and state.',
  },
];

const cards = sections
  .map(
    (s) => `      <a class="card" href="${s.href}">
        <span class="tool">${s.tool}</span>
        <h2>${s.title}</h2>
        <p>${s.blurb}</p>
        <span class="go">Open &rarr;</span>
      </a>`,
  )
  .join('\n');

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SyncFlow — Documentation</title>
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100dvh;
        font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        color: #e5e7eb;
        background: radial-gradient(1200px 600px at 70% -10%, #1e293b 0%, #0b1120 55%);
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 4rem 1.25rem;
      }
      header { max-width: 60rem; width: 100%; margin-bottom: 2.5rem; }
      .brand { display: flex; align-items: center; gap: 0.6rem; font-weight: 700; font-size: 1.05rem; letter-spacing: -0.01em; }
      .dot { width: 0.7rem; height: 0.7rem; border-radius: 9999px; background: #6366f1; box-shadow: 0 0 18px 2px #6366f1aa; }
      h1 { font-size: clamp(2rem, 5vw, 3rem); margin: 1.25rem 0 0.5rem; letter-spacing: -0.03em; }
      header p { margin: 0; color: #94a3b8; font-size: 1.05rem; max-width: 40rem; }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
        gap: 1.1rem;
        max-width: 60rem;
        width: 100%;
      }
      .card {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        padding: 1.4rem;
        border-radius: 0.9rem;
        background: #111827cc;
        border: 1px solid #1f2937;
        text-decoration: none;
        color: inherit;
        transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease;
      }
      .card:hover { transform: translateY(-3px); border-color: #6366f1; background: #131c30; }
      .tool { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; color: #818cf8; font-weight: 600; }
      .card h2 { margin: 0; font-size: 1.25rem; letter-spacing: -0.01em; }
      .card p { margin: 0; color: #94a3b8; font-size: 0.92rem; line-height: 1.5; flex: 1; }
      .go { color: #c7d2fe; font-size: 0.9rem; font-weight: 600; }
      footer { max-width: 60rem; width: 100%; margin-top: 2.5rem; color: #64748b; font-size: 0.85rem; }
      footer a { color: #94a3b8; }
    </style>
  </head>
  <body>
    <header>
      <div class="brand"><span class="dot"></span> SyncFlow</div>
      <h1>Documentation</h1>
      <p>Generated reference for SyncFlow — the real-time collaborative whiteboard. Each section below is produced directly from the source, so it never drifts from the code.</p>
    </header>
    <main class="grid">
${cards}
    </main>
    <footer>
      Built from the <code>pnpm docs</code> pipeline. Source: <a href="https://github.com/taizhixuan/SyncFlow">github.com/taizhixuan/SyncFlow</a> · Live app: <a href="https://syncflows.xyz">syncflows.xyz</a>
    </footer>
  </body>
</html>
`;

mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, 'index.html'), html);
// Stop GitHub Pages' Jekyll processor from ignoring folders that start with "_".
writeFileSync(resolve(outDir, '.nojekyll'), '');
console.log('Docs landing page written to docs/index.html');
