import type { CanvasElement } from '@syncflow/shared';
import {
  resolveFill,
  resolveStroke,
  resolveMindNodeFill,
  resolveMindNodeBorder,
  resolveFrameBorder,
  resolveFrameFill,
  type Theme,
} from './colors';
import { resolveConnector } from './connector';
import { getBounds } from './element';

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

function svgColor(c: string | null | undefined): string {
  return c ?? 'none';
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Element serializers ─────────────────────────────────────────────────────

function openGroup(el: CanvasElement): string {
  const parts: string[] = [`<g id="${el.id}"`];
  if ((el.opacity ?? 1) !== 1) parts.push(` opacity="${el.opacity ?? 1}"`);
  const rot = el.rotation ?? 0;
  const w = el.width ?? 0;
  const h = el.height ?? 0;
  if (rot !== 0) {
    parts.push(` transform="translate(${el.x},${el.y}) rotate(${rot},${w / 2},${h / 2})"`);
  } else {
    parts.push(` transform="translate(${el.x},${el.y})"`);
  }
  parts.push('>');
  return parts.join('');
}

function serializeRect(el: CanvasElement, theme: Theme): string {
  const fill = svgColor(resolveFill(el.fill, theme));
  const stroke = resolveStroke(el.stroke ?? 'auto', theme);
  const sw = el.strokeWidth ?? 1;
  const cr = el.cornerRadius ?? (el.type === 'rect' ? 4 : 0);
  const w = el.width ?? 0;
  const h = el.height ?? 0;
  return [
    openGroup(el),
    `<rect x="0" y="0" width="${w}" height="${h}" rx="${cr}" ry="${cr}"`,
    ` fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dashArray(el.strokeStyle)}/>`,
    '</g>',
  ].join('');
}

function serializeEllipse(el: CanvasElement, theme: Theme): string {
  const w = el.width ?? 0;
  const h = el.height ?? 0;
  const cx = w / 2;
  const cy = h / 2;
  const fill = svgColor(resolveFill(el.fill, theme));
  const stroke = resolveStroke(el.stroke ?? 'auto', theme);
  const sw = el.strokeWidth ?? 1;
  return [
    openGroup(el),
    `<ellipse cx="${cx}" cy="${cy}" rx="${cx}" ry="${cy}"`,
    ` fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dashArray(el.strokeStyle)}/>`,
    '</g>',
  ].join('');
}

function serializeDiamond(el: CanvasElement, theme: Theme): string {
  const w = el.width ?? 0;
  const h = el.height ?? 0;
  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.max(w, h) / 2;
  const fill = svgColor(resolveFill(el.fill, theme));
  const stroke = resolveStroke(el.stroke ?? 'auto', theme);
  const sw = el.strokeWidth ?? 1;
  const pts = regularPolygonPoints(cx, cy, radius, 4);
  return [
    openGroup(el),
    `<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dashArray(el.strokeStyle)}/>`,
    '</g>',
  ].join('');
}

function serializeTriangle(el: CanvasElement, theme: Theme): string {
  const w = el.width ?? 0;
  const h = el.height ?? 0;
  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.max(w, h) / 2;
  const fill = svgColor(resolveFill(el.fill, theme));
  const stroke = resolveStroke(el.stroke ?? 'auto', theme);
  const sw = el.strokeWidth ?? 1;
  const pts = regularPolygonPoints(cx, cy, radius, 3);
  return [
    openGroup(el),
    `<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dashArray(el.strokeStyle)}/>`,
    '</g>',
  ].join('');
}

function serializeStar(el: CanvasElement, theme: Theme): string {
  const w = el.width ?? 0;
  const h = el.height ?? 0;
  const cx = w / 2;
  const cy = h / 2;
  const outer = Math.max(w, h) / 2;
  const inner = outer / 2;
  const fill = svgColor(resolveFill(el.fill, theme));
  const stroke = resolveStroke(el.stroke ?? 'auto', theme);
  const sw = el.strokeWidth ?? 1;
  const pts = starPoints(cx, cy, 5, inner, outer);
  return [
    openGroup(el),
    `<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dashArray(el.strokeStyle)}/>`,
    '</g>',
  ].join('');
}

function serializeText(el: CanvasElement, theme: Theme): string {
  const fill = resolveStroke(el.stroke ?? 'auto', theme); // text color = stroke
  const fs = el.fontSize ?? 16;
  const w = el.width ?? 200;
  const h = el.height ?? 28;
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
  const fill = svgColor(el.fill ?? '#FFEFB0');
  const stroke = el.stroke ?? '#E8D27A';
  const sw = el.strokeWidth ?? 1;
  const w = el.width ?? 160;
  const h = el.height ?? 120;
  const fs = el.fontSize ?? 16;
  const textColor = resolveStroke('auto', theme);
  const textContent = esc(el.text ?? '');
  return [
    openGroup(el),
    `<rect x="0" y="0" width="${w}" height="${h}" rx="4" ry="4" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`,
    `<text x="${w / 2}" y="${h / 2 + fs * 0.35}" text-anchor="middle" font-size="${fs}" fill="${textColor}" font-family="Inter, sans-serif">${textContent}</text>`,
    '</g>',
  ].join('');
}

function serializeCode(el: CanvasElement, theme: Theme): string {
  const fill = el.fill ?? '#1E1E26';
  const stroke = el.stroke ?? '#2A2A33';
  const sw = el.strokeWidth ?? 1;
  const w = el.width ?? 280;
  const h = el.height ?? 140;
  const fs = el.fontSize ?? 13;
  const textColor = resolveStroke('auto', 'dark'); // code block text always light
  void theme;
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
  const stroke = resolveFrameBorder(el.stroke ?? 'auto', theme);
  const w = el.width ?? 480;
  const h = el.height ?? 320;
  const label = esc(el.name ?? '');
  const textColor = resolveStroke('auto', theme);
  return [
    openGroup(el),
    `<rect x="0" y="0" width="${w}" height="${h}" rx="2" ry="2" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`,
    label ? `<text x="0" y="-8" font-size="12" fill="${textColor}" font-family="Inter, sans-serif">${label}</text>` : '',
    '</g>',
  ].join('');
}

function serializeMindNode(el: CanvasElement, theme: Theme): string {
  const fill = resolveMindNodeFill(el.fill, theme, el.collapsed ?? false);
  const stroke = resolveMindNodeBorder(el.stroke ?? 'auto', theme);
  const sw = el.strokeWidth ?? 1.5;
  const w = el.width ?? 140;
  const h = el.height ?? 44;
  const fs = el.fontSize ?? 14;
  const textColor = resolveStroke('auto', theme);
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
  const stroke = resolveStroke(el.stroke ?? 'auto', theme);
  const sw = el.strokeWidth ?? 1;
  // Line points are relative to el.x, el.y — group handles translate
  const svgPoints: string[] = [];
  for (let i = 0; i + 1 < pts.length; i += 2) {
    svgPoints.push(`${pts[i]!},${pts[i + 1]!}`);
  }
  return [
    openGroup(el),
    `<polyline points="${svgPoints.join(' ')}" fill="none" stroke="${stroke}" stroke-width="${sw}"${dashArray(el.strokeStyle)}/>`,
    '</g>',
  ].join('');
}

function serializeFreehand(el: CanvasElement, theme: Theme): string {
  const stroke = resolveStroke(el.stroke ?? 'auto', theme);
  const sw = el.strokeWidth ?? 2;
  const pts = el.points ?? [];
  if (pts.length < 2) return '';
  // Build an SVG path with quadratic curves for smooth tension
  let d = `M ${pts[0]},${pts[1]}`;
  for (let i = 2; i + 1 < pts.length; i += 2) {
    d += ` L ${pts[i]},${pts[i + 1]}`;
  }
  return [
    openGroup(el),
    `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`,
    '</g>',
  ].join('');
}

function serializeConnector(el: CanvasElement, elements: Record<string, CanvasElement>, theme: Theme): string {
  const { from, to } = resolveConnector(el, elements);
  const stroke = resolveStroke(el.stroke ?? 'auto', theme);
  const sw = el.strokeWidth ?? 1;
  const markerId = `arrow-${el.id}`;
  const hasEnd = el.endArrow;
  const hasStart = el.startArrow;

  let defs = '';
  if (hasEnd || hasStart) {
    defs = `<defs><marker id="${markerId}" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="${stroke}"/></marker></defs>`;
  }

  const markerEnd = hasEnd ? ` marker-end="url(#${markerId})"` : '';
  const markerStart = hasStart ? ` marker-start="url(#${markerId})"` : '';

  // Connector sits at (0,0) in its own coordinate space — no group translate needed
  // but we still emit a group for consistency (el.x and el.y are 0 for connectors)
  return [
    `<g id="${el.id}">`,
    defs,
    `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}"`,
    ` stroke="${stroke}" stroke-width="${sw}"${markerEnd}${markerStart}${dashArray(el.strokeStyle)}/>`,
    '</g>',
  ].join('');
}

function serializeImage(el: CanvasElement): string {
  const w = el.width ?? 0;
  const h = el.height ?? 0;
  if (!el.assetUrl) {
    return [openGroup(el), `<!-- image omitted: no assetUrl -->`, '</g>'].join('');
  }
  return [
    openGroup(el),
    `<image href="${el.assetUrl}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>`,
    '</g>',
  ].join('');
}

function serializeEmbed(el: CanvasElement, theme: Theme): string {
  const w = el.width ?? 240;
  const h = el.height ?? 72;
  const stroke = resolveStroke(el.stroke ?? 'auto', theme);
  const title = esc(el.title ?? el.url ?? '');
  const textColor = resolveStroke('auto', theme);
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
    let x1: number;
    let y1: number;
    let x2: number;
    let y2: number;

    if (el.type === 'connector') {
      const { from, to } = resolveConnector(el, elementsDict);
      x1 = Math.min(from.x, to.x);
      y1 = Math.min(from.y, to.y);
      x2 = Math.max(from.x, to.x);
      y2 = Math.max(from.y, to.y);
    } else {
      const b = getBounds(el);
      x1 = b.x;
      y1 = b.y;
      x2 = b.x + b.width;
      y2 = b.y + b.height;
    }

    if (x1 < minX) minX = x1;
    if (y1 < minY) minY = y1;
    if (x2 > maxX) maxX = x2;
    if (y2 > maxY) maxY = y2;
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

  const sorted = els.slice().sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

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
        parts.push(serializeCode(el, theme));
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
        parts.push(`<!-- unsupported element type: ${(el as CanvasElement).type} -->`);
    }
  }

  parts.push('</svg>');
  return parts.join('\n');
}
