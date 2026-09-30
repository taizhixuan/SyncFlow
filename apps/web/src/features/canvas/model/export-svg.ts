import type { CanvasElement } from '@syncflow/shared';
import {
  resolveFill,
  resolveStroke,
  resolveMindNodeFill,
  resolveMindNodeBorder,
  resolveFrameBorder,
  resolveFrameFill,
  THEME_INK,
  type Theme,
} from './colors';
import { resolveConnector, elementBounds } from './connector';
import { compareZ } from './element';

// ─── Output safety ───────────────────────────────────────────────────────────
//
// Every value below comes from the shared doc, i.e. from any collaborator. The
// exported file is opened by someone else, often straight in a browser, where
// SVG runs script. So nothing is interpolated raw: text and attributes are
// escaped, colors are allow-listed, image URLs are scheme-checked, and no doc
// value is ever placed inside an XML comment.

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** A finite number for an attribute; anything else becomes `fallback`. */
function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNC_COLOR = /^(?:rgba?|hsla?)\(\s*[-+0-9.%]+(?:\s*[,\s]\s*[-+0-9.%]+){2,3}\s*(?:\/\s*[-+0-9.%]+\s*)?\)$/i;
const NAMED_COLOR = /^[a-z]{3,20}$/i;

/** `value` if it is a plain CSS color (hex, rgb/hsl, named, none), else `fallback`. */
export function safeColor(value: string | null | undefined, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const v = value.trim();
  if (HEX_COLOR.test(v) || FUNC_COLOR.test(v) || NAMED_COLOR.test(v)) return v;
  return fallback;
}

function strokeOf(el: CanvasElement, theme: Theme): string {
  return safeColor(resolveStroke(el.stroke ?? 'auto', theme), THEME_INK[theme]);
}

function fillOf(el: CanvasElement, theme: Theme): string {
  return safeColor(resolveFill(el.fill, theme), 'none');
}

/** An explicit, valid `textColor` wins over the element's default label color. */
function labelColor(el: CanvasElement, fallback: string): string {
  if (!el.textColor || el.textColor === 'auto') return fallback;
  return safeColor(el.textColor, fallback);
}

const DATA_IMAGE = /^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]*$/i;

/** Only http(s) and raster data URLs may be embedded; anything else is dropped. */
export function safeImageUrl(url: string | undefined): string | null {
  if (!url) return null;
  if (DATA_IMAGE.test(url)) return url;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null;
  } catch {
    return null;
  }
}

// ─── Geometry helpers ────────────────────────────────────────────────────────

function regularPolygonPoints(cx: number, cy: number, radius: number, sides: number): string {
  const pts: string[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = (2 * Math.PI * i) / sides - Math.PI / 2;
    pts.push(`${(cx + radius * Math.cos(angle)).toFixed(2)},${(cy + radius * Math.sin(angle)).toFixed(2)}`);
  }
  return pts.join(' ');
}

function starPoints(cx: number, cy: number, numPoints: number, inner: number, outer: number): string {
  const pts: string[] = [];
  for (let i = 0; i < numPoints * 2; i++) {
    const angle = (Math.PI * i) / numPoints - Math.PI / 2;
    const r = i % 2 === 0 ? outer : inner;
    pts.push(`${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`);
  }
  return pts.join(' ');
}

function dashArray(style: string | null | undefined): string {
  if (style === 'dashed') return ' stroke-dasharray="10 6"';
  if (style === 'dotted') return ' stroke-dasharray="2 6"';
  return '';
}

// ─── Element serializers ─────────────────────────────────────────────────────

function openGroup(el: CanvasElement): string {
  const parts: string[] = [`<g id="${esc(el.id)}"`];
  const opacity = num(el.opacity, 1);
  if (opacity !== 1) parts.push(` opacity="${opacity}"`);
  const rot = num(el.rotation);
  // Konva rotates a Group about its (x, y) origin (element-view sets no
  // offset), so the export must too; rotating about the center shifted every
  // rotated shape relative to the canvas.
  const translate = `translate(${num(el.x)},${num(el.y)})`;
  parts.push(` transform="${rot !== 0 ? `${translate} rotate(${rot})` : translate}"`);
  parts.push('>');
  return parts.join('');
}

function serializeRect(el: CanvasElement, theme: Theme): string {
  const fill = fillOf(el, theme);
  const stroke = strokeOf(el, theme);
  const sw = num(el.strokeWidth, 1);
  const cr = num(el.cornerRadius, el.type === 'rect' ? 4 : 0);
  const w = num(el.width);
  const h = num(el.height);
  return [
    openGroup(el),
    `<rect x="0" y="0" width="${w}" height="${h}" rx="${cr}" ry="${cr}"`,
    ` fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dashArray(el.strokeStyle)}/>`,
    '</g>',
  ].join('');
}

function serializeEllipse(el: CanvasElement, theme: Theme): string {
  const w = num(el.width);
  const h = num(el.height);
  const cx = w / 2;
  const cy = h / 2;
  const fill = fillOf(el, theme);
  const stroke = strokeOf(el, theme);
  const sw = num(el.strokeWidth, 1);
  return [
    openGroup(el),
    `<ellipse cx="${cx}" cy="${cy}" rx="${cx}" ry="${cy}"`,
    ` fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dashArray(el.strokeStyle)}/>`,
    '</g>',
  ].join('');
}

function serializePolygon(el: CanvasElement, theme: Theme, pts: string): string {
  const fill = fillOf(el, theme);
  const stroke = strokeOf(el, theme);
  const sw = num(el.strokeWidth, 1);
  return [
    openGroup(el),
    `<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dashArray(el.strokeStyle)}/>`,
    '</g>',
  ].join('');
}

function serializeDiamond(el: CanvasElement, theme: Theme): string {
  const w = num(el.width);
  const h = num(el.height);
  return serializePolygon(el, theme, regularPolygonPoints(w / 2, h / 2, Math.max(w, h) / 2, 4));
}

function serializeTriangle(el: CanvasElement, theme: Theme): string {
  const w = num(el.width);
  const h = num(el.height);
  return serializePolygon(el, theme, regularPolygonPoints(w / 2, h / 2, Math.max(w, h) / 2, 3));
}

function serializeStar(el: CanvasElement, theme: Theme): string {
  const w = num(el.width);
  const h = num(el.height);
  const outer = Math.max(w, h) / 2;
  return serializePolygon(el, theme, starPoints(w / 2, h / 2, 5, outer / 2, outer));
}

function serializeText(el: CanvasElement, theme: Theme): string {
  const fill = labelColor(el, strokeOf(el, theme)); // default text color = stroke
  const fs = num(el.fontSize, 16);
  const w = num(el.width, 200);
  const h = num(el.height, 28);
  const textContent = esc(el.text ?? '');
  // Align text at center of box
  const cx = w / 2;
  const cy = h / 2 + fs * 0.35;
  return [
    openGroup(el),
    `<text x="${cx}" y="${cy}" text-anchor="middle" font-size="${fs}" fill="${fill}" font-family="Inter, sans-serif">${textContent}</text>`,
    '</g>',
  ].join('');
}

function serializeSticky(el: CanvasElement, theme: Theme): string {
  const fill = safeColor(el.fill ?? '#FFEFB0', '#FFEFB0');
  const stroke = safeColor(el.stroke ?? '#E8D27A', '#E8D27A');
  const sw = num(el.strokeWidth, 1);
  const w = num(el.width, 160);
  const h = num(el.height, 120);
  const fs = num(el.fontSize, 16);
  const textColor = labelColor(el, resolveStroke('auto', theme));
  const textContent = esc(el.text ?? '');
  return [
    openGroup(el),
    `<rect x="0" y="0" width="${w}" height="${h}" rx="4" ry="4" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`,
    `<text x="${w / 2}" y="${h / 2 + fs * 0.35}" text-anchor="middle" font-size="${fs}" fill="${textColor}" font-family="Inter, sans-serif">${textContent}</text>`,
    '</g>',
  ].join('');
}

function serializeCode(el: CanvasElement): string {
  const fill = safeColor(el.fill ?? '#1E1E26', '#1E1E26');
  const stroke = safeColor(el.stroke ?? '#2A2A33', '#2A2A33');
  const sw = num(el.strokeWidth, 1);
  const w = num(el.width, 280);
  const h = num(el.height, 140);
  const fs = num(el.fontSize, 13);
  // Code blocks are always dark, so their default text is light in both themes.
  const textColor = labelColor(el, resolveStroke('auto', 'dark'));
  const textContent = esc(el.text ?? '');
  return [
    openGroup(el),
    `<rect x="0" y="0" width="${w}" height="${h}" rx="4" ry="4" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`,
    `<text x="8" y="${fs + 8}" font-size="${fs}" fill="${textColor}" font-family="monospace">${textContent}</text>`,
    '</g>',
  ].join('');
}

function serializeFrame(el: CanvasElement, theme: Theme): string {
  const fill = resolveFrameFill(theme);
  const stroke = safeColor(resolveFrameBorder(el.stroke ?? 'auto', theme), THEME_INK[theme]);
  const w = num(el.width, 480);
  const h = num(el.height, 320);
  const label = esc(el.name ?? '');
  const textColor = labelColor(el, resolveStroke('auto', theme));
  return [
    openGroup(el),
    `<rect x="0" y="0" width="${w}" height="${h}" rx="2" ry="2" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`,
    label ? `<text x="0" y="-8" font-size="12" fill="${textColor}" font-family="Inter, sans-serif">${label}</text>` : '',
    '</g>',
  ].join('');
}

function serializeMindNode(el: CanvasElement, theme: Theme): string {
  const fill = safeColor(resolveMindNodeFill(el.fill, theme, el.collapsed ?? false), 'none');
  const stroke = safeColor(resolveMindNodeBorder(el.stroke ?? 'auto', theme), THEME_INK[theme]);
  const sw = num(el.strokeWidth, 1.5);
  const w = num(el.width, 140);
  const h = num(el.height, 44);
  const fs = num(el.fontSize, 14);
  const textColor = labelColor(el, resolveStroke('auto', theme));
  const textContent = esc(el.text ?? '');
  return [
    openGroup(el),
    `<rect x="0" y="0" width="${w}" height="${h}" rx="22" ry="22" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`,
    `<text x="${w / 2}" y="${h / 2 + fs * 0.35}" text-anchor="middle" font-size="${fs}" fill="${textColor}" font-family="Inter, sans-serif">${textContent}</text>`,
    '</g>',
  ].join('');
}

function serializeLine(el: CanvasElement, theme: Theme): string {
  const pts = el.points ?? [0, 0, 0, 0];
  const stroke = strokeOf(el, theme);
  const sw = num(el.strokeWidth, 1);
  // Line points are relative to el.x, el.y — group handles translate
  const svgPoints: string[] = [];
  for (let i = 0; i + 1 < pts.length; i += 2) {
    svgPoints.push(`${num(pts[i])},${num(pts[i + 1])}`);
  }
  return [
    openGroup(el),
    `<polyline points="${svgPoints.join(' ')}" fill="none" stroke="${stroke}" stroke-width="${sw}"${dashArray(el.strokeStyle)}/>`,
    '</g>',
  ].join('');
}

function serializeFreehand(el: CanvasElement, theme: Theme): string {
  const stroke = strokeOf(el, theme);
  const sw = num(el.strokeWidth, 2);
  const pts = el.points ?? [];
  if (pts.length < 2) return '';
  let d = `M ${num(pts[0])},${num(pts[1])}`;
  for (let i = 2; i + 1 < pts.length; i += 2) {
    d += ` L ${num(pts[i])},${num(pts[i + 1])}`;
  }
  return [
    openGroup(el),
    `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`,
    '</g>',
  ].join('');
}

function serializeConnector(el: CanvasElement, elements: Record<string, CanvasElement>, theme: Theme): string {
  const { from, to } = resolveConnector(el, elements);
  const stroke = strokeOf(el, theme);
  const sw = num(el.strokeWidth, 1);
  const markerId = esc(`arrow-${el.id}`);
  const hasEnd = el.endArrow;
  const hasStart = el.startArrow;

  let defs = '';
  if (hasEnd || hasStart) {
    defs = `<defs><marker id="${markerId}" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="${stroke}"/></marker></defs>`;
  }

  const markerEnd = hasEnd ? ` marker-end="url(#${markerId})"` : '';
  const markerStart = hasStart ? ` marker-start="url(#${markerId})"` : '';

  // Connector endpoints are absolute board coordinates, so no group translate.
  return [
    `<g id="${esc(el.id)}">`,
    defs,
    `<line x1="${num(from.x)}" y1="${num(from.y)}" x2="${num(to.x)}" y2="${num(to.y)}"`,
    ` stroke="${stroke}" stroke-width="${sw}"${markerEnd}${markerStart}${dashArray(el.strokeStyle)}/>`,
    '</g>',
  ].join('');
}

function serializeImage(el: CanvasElement): string {
  const w = num(el.width);
  const h = num(el.height);
  const href = safeImageUrl(el.assetUrl);
  if (!href) {
    return [openGroup(el), '<!-- image omitted: missing or unsupported url -->', '</g>'].join('');
  }
  return [
    openGroup(el),
    `<image href="${esc(href)}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>`,
    '</g>',
  ].join('');
}

function serializeEmbed(el: CanvasElement, theme: Theme): string {
  const w = num(el.width, 240);
  const h = num(el.height, 72);
  const stroke = strokeOf(el, theme);
  const title = esc(el.title ?? el.url ?? '');
  const textColor = labelColor(el, resolveStroke('auto', theme));
  return [
    openGroup(el),
    `<rect x="0" y="0" width="${w}" height="${h}" rx="4" ry="4" fill="none" stroke="${stroke}" stroke-width="1"/>`,
    title ? `<text x="8" y="${h / 2 + 5}" font-size="12" fill="${textColor}" font-family="Inter, sans-serif">${title}</text>` : '',
    '</g>',
  ].join('');
}

// ─── Bounding box ─────────────────────────────────────────────────────────────

function computeViewBox(
  els: CanvasElement[],
  elementsDict: Record<string, CanvasElement>,
): { minX: number; minY: number; width: number; height: number } {
  if (els.length === 0) return { minX: 0, minY: 0, width: 800, height: 600 };

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const el of els) {
    const b = elementBounds(el, elementsDict);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }

  return {
    minX,
    minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export function elementsToSvg(els: CanvasElement[], theme: Theme): string {
  const elementsDict: Record<string, CanvasElement> = {};
  for (const el of els) elementsDict[el.id] = el;

  const { minX, minY, width, height } = computeViewBox(els, elementsDict);
  const PADDING = 16;
  const vbX = minX - PADDING;
  const vbY = minY - PADDING;
  const vbW = width + PADDING * 2;
  const vbH = height + PADDING * 2;

  const sorted = els.slice().sort(compareZ);

  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbX} ${vbY} ${vbW} ${vbH}" width="${vbW}" height="${vbH}">`);

  for (const el of sorted) {
    switch (el.type) {
      case 'rect':
        parts.push(serializeRect(el, theme));
        break;
      case 'ellipse':
        parts.push(serializeEllipse(el, theme));
        break;
      case 'diamond':
        parts.push(serializeDiamond(el, theme));
        break;
      case 'triangle':
        parts.push(serializeTriangle(el, theme));
        break;
      case 'star':
        parts.push(serializeStar(el, theme));
        break;
      case 'text':
        parts.push(serializeText(el, theme));
        break;
      case 'sticky':
        parts.push(serializeSticky(el, theme));
        break;
      case 'code':
        parts.push(serializeCode(el));
        break;
      case 'frame':
        parts.push(serializeFrame(el, theme));
        break;
      case 'mindnode':
        parts.push(serializeMindNode(el, theme));
        break;
      case 'line':
        parts.push(serializeLine(el, theme));
        break;
      case 'freehand':
        parts.push(serializeFreehand(el, theme));
        break;
      case 'connector':
        parts.push(serializeConnector(el, elementsDict, theme));
        break;
      case 'image':
        parts.push(serializeImage(el));
        break;
      case 'embed':
        parts.push(serializeEmbed(el, theme));
        break;
      default:
        // The type is peer data: never interpolate it into a comment.
        parts.push('<!-- unsupported element type -->');
    }
  }

  parts.push('</svg>');
  return parts.join('\n');
}
