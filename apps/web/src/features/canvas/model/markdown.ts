/**
 * Dependency-free markdown block parser for canvas text elements.
 *
 * Limitation (documented): mixed inline styles within one line are approximated
 * at the line level — the whole line takes the first detected emphasis (bold or
 * italic). Full inline rich layout is not attempted because Konva Text cannot
 * render mixed character-level runs inside a single wrapped paragraph.
 */

// ─── Block type definitions ──────────────────────────────────────────────────

export interface HeadingBlock {
  kind: 'heading';
  level: 1 | 2 | 3;
  text: string;
}

export interface ListItemBlock {
  kind: 'list-item';
  ordered: boolean;
  /** 1-based index for ordered items; undefined for unordered. */
  index?: number;
  text: string;
  bold?: boolean;
  italic?: boolean;
}

export interface LinkInfo {
  label: string;
  url: string;
}

export interface ParagraphBlock {
  kind: 'paragraph';
  text: string;
  bold?: boolean;
  italic?: boolean;
  /** Present when the line contains a Markdown link `[label](url)`. */
  link?: LinkInfo;
}

export type MdBlock = HeadingBlock | ListItemBlock | ParagraphBlock;

// ─── Inline helpers ───────────────────────────────────────────────────────────

/** Regex that matches a full-line bold span: **text** */
const BOLD_RE = /^\*\*(.+)\*\*$/;

/**
 * Regex for italic. We only match *text* when it is NOT **text** (bold).
 * A single leading/trailing * that is not doubled.
 */
const ITALIC_RE = /^\*(?!\*)(.+)(?<!\*)\*$/;

/** Regex for a Markdown link anywhere in the line: [label](url) */
const LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/;

/**
 * Strip bold/italic markers from a raw line text and detect emphasis.
 * Returns { text, bold, italic }.
 *
 * Documented limitation: if a line mixes bold and italic in different runs,
 * only the first detected marker wins. The entire line is treated as that
 * emphasis level.
 */
function parseInlineEmphasis(raw: string): { text: string; bold: boolean; italic: boolean } {
  const boldMatch = BOLD_RE.exec(raw);
  if (boldMatch) {
    return { text: boldMatch[1] ?? raw, bold: true, italic: false };
  }
  const italicMatch = ITALIC_RE.exec(raw);
  if (italicMatch) {
    return { text: italicMatch[1] ?? raw, bold: false, italic: true };
  }
  return { text: raw, bold: false, italic: false };
}

/**
 * Extract a link from a line if present.
 * Returns the link info and a version of the line with the marker stripped.
 */
function extractLink(raw: string): { text: string; link: LinkInfo | undefined } {
  const m = LINK_RE.exec(raw);
  if (!m) return { text: raw, link: undefined };
  const label = m[1] ?? '';
  const url = m[2] ?? '';
  // Replace the [label](url) with just the label so Konva renders readable text.
  const text = raw.replace(LINK_RE, label);
  return { text, link: { label, url } };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse a markdown string into an array of typed blocks.
 * Only block-level constructs are supported; inline HTML is not.
 */
export function parseMarkdownBlocks(src: string): MdBlock[] {
  if (!src) return [];

  const lines = src.split('\n');
  const blocks: MdBlock[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    // Skip blank lines.
    if (line.trim() === '') continue;

    // ── Headings (levels 1–3) ────────────────────────────────────────────────
    const h3 = /^### (.+)$/.exec(line);
    if (h3) {
      blocks.push({ kind: 'heading', level: 3, text: (h3[1] ?? '').trim() });
      continue;
    }
    const h2 = /^## (.+)$/.exec(line);
    if (h2) {
      blocks.push({ kind: 'heading', level: 2, text: (h2[1] ?? '').trim() });
      continue;
    }
    const h1 = /^# (.+)$/.exec(line);
    if (h1) {
      blocks.push({ kind: 'heading', level: 1, text: (h1[1] ?? '').trim() });
      continue;
    }

    // ── Unordered list items (- or *) ────────────────────────────────────────
    const ul = /^[-*] (.+)$/.exec(line);
    if (ul) {
      const raw = (ul[1] ?? '').trim();
      const { text, bold, italic } = parseInlineEmphasis(raw);
      const item: ListItemBlock = { kind: 'list-item', ordered: false, text };
      if (bold) item.bold = true;
      if (italic) item.italic = true;
      blocks.push(item);
      continue;
    }

    // ── Ordered list items (N.) ───────────────────────────────────────────────
    const ol = /^(\d+)\. (.+)$/.exec(line);
    if (ol) {
      const index = parseInt(ol[1] ?? '1', 10);
      const raw = (ol[2] ?? '').trim();
      const { text, bold, italic } = parseInlineEmphasis(raw);
      const item: ListItemBlock = { kind: 'list-item', ordered: true, index, text };
      if (bold) item.bold = true;
      if (italic) item.italic = true;
      blocks.push(item);
      continue;
    }

    // ── Paragraph (with optional bold/italic/link detection) ─────────────────
    const { text: linkStripped, link } = extractLink(line);
    const { text, bold, italic } = parseInlineEmphasis(linkStripped);
    const para: ParagraphBlock = { kind: 'paragraph', text };
    if (bold) para.bold = true;
    if (italic) para.italic = true;
    if (link) para.link = link;
    blocks.push(para);
  }

  return blocks;
}
