import { Ellipse, Line, Rect, RegularPolygon, Star, Text } from 'react-konva';
import type { ReactNode } from 'react';
import type { CanvasElement } from '@syncflow/shared';
import {
  resolveFill,
  resolveFrameBorder,
  resolveFrameFill,
  resolveLabelColor,
  resolveLinkColor,
  resolveMindNodeBorder,
  resolveMindNodeFill,
  resolveStroke,
  type Theme,
} from '../model/colors';
import { parseMarkdownBlocks } from '../model/markdown';
import type { MdBlock } from '../model/markdown';

const dash = (style?: string): number[] | undefined =>
  style === 'dashed' ? [10, 6] : style === 'dotted' ? [2, 6] : undefined;

/** Default body font when an element has no explicit fontFamily. */
const DEFAULT_FONT = 'Inter';

/** True when the element's weight should render bold. Accepts 'bold' or a numeric weight ≥ 600. */
function isBold(el: CanvasElement): boolean {
  return el.fontWeight === 'bold' || (typeof el.fontWeight === 'number' && el.fontWeight >= 600);
}

/** Map an element's weight + italic flags onto a Konva fontStyle string. */
function fontStyleOf(el: CanvasElement): string {
  const bold = isBold(el);
  const italic = el.italic === true;
  if (bold && italic) return 'bold italic';
  if (bold) return 'bold';
  if (italic) return 'italic';
  return 'normal';
}

/** The font family to render with, falling back to the body sans when unset. */
function fontFamilyOf(el: CanvasElement, fallback = DEFAULT_FONT): string {
  return el.fontFamily ?? fallback;
}

/**
 * Render parsed markdown blocks as a vertical stack of Konva <Text> nodes.
 * Each block gets its own node so heading sizes, styles, and indents are clean.
 *
 * Documented limitation: mixed inline styles within one line are approximated
 * at the line level (see markdown.ts). Konva Text cannot render mixed runs in
 * a single wrapped paragraph.
 */
function renderMarkdownBlocks(
  blocks: MdBlock[],
  baseFontSize: number,
  width: number,
  textColor: string,
  theme: Theme,
  fontFamily = 'Inter',
): ReactNode[] {
  const LINE_HEIGHT = 1.4;
  const nodes: ReactNode[] = [];
  let y = 0;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!;

    if (block.kind === 'heading') {
      const scale = block.level === 1 ? 1.75 : block.level === 2 ? 1.4 : 1.15;
      const fs = Math.round(baseFontSize * scale);
      nodes.push(
        <Text
          key={i}
          y={y}
          width={width}
          text={block.text}
          fontSize={fs}
          fontFamily={fontFamily}
          fontStyle="bold"
          fill={textColor}
          lineHeight={LINE_HEIGHT}
          listening={false}
        />,
      );
      y += fs * LINE_HEIGHT + 4;
    } else if (block.kind === 'list-item') {
      const prefix = block.ordered ? `${block.index ?? 1}.  ` : '•  ';
      const indent = baseFontSize * 1.2;
      const fontStyle = block.bold ? 'bold' : block.italic ? 'italic' : 'normal';
      nodes.push(
        <Text
          key={i}
          y={y}
          x={0}
          width={Math.max(indent, 12)}
          text={prefix}
          fontSize={baseFontSize}
          fontFamily={fontFamily}
          fontStyle={fontStyle}
          fill={textColor}
          lineHeight={LINE_HEIGHT}
          listening={false}
        />,
      );
      nodes.push(
        <Text
          key={`${i}-body`}
          y={y}
          x={indent}
          width={Math.max(1, width - indent)}
          text={block.text}
          fontSize={baseFontSize}
          fontFamily={fontFamily}
          fontStyle={fontStyle}
          fill={textColor}
          lineHeight={LINE_HEIGHT}
          listening={false}
        />,
      );
      y += baseFontSize * LINE_HEIGHT;
    } else {
      // paragraph
      const fontStyle = block.bold ? 'bold' : block.italic ? 'italic' : 'normal';
      const fill = block.link ? resolveLinkColor(theme) : textColor;
      const decoration = block.link ? 'underline' : '';
      nodes.push(
        <Text
          key={i}
          y={y}
          width={width}
          text={block.text}
          fontSize={baseFontSize}
          fontFamily={fontFamily}
          fontStyle={fontStyle}
          fill={fill}
          textDecoration={decoration}
          lineHeight={LINE_HEIGHT}
          listening={false}
        />,
      );
      y += baseFontSize * LINE_HEIGHT;
    }
  }

  return nodes;
}

/** Centered label rendered inside a box-like shape when it has text. */
function boxLabel(el: CanvasElement, theme: Theme, w: number, h: number): ReactNode {
  if (!el.text) return null;
  return (
    <Text
      text={el.text}
      width={w}
      height={h}
      align={el.textAlign ?? 'center'}
      verticalAlign="middle"
      padding={6}
      fontSize={el.fontSize ?? 16}
      fontFamily={fontFamilyOf(el)}
      fontStyle={fontStyleOf(el)}
      fill={resolveLabelColor(el.textColor, el.fill, theme)}
      listening={false}
    />
  );
}

export function renderElement(el: CanvasElement, theme: Theme): ReactNode {
  const stroke = resolveStroke(el.stroke, theme);
  const fill = resolveFill(el.fill, theme);
  const w = el.width ?? 0;
  const h = el.height ?? 0;
  const common = { stroke, strokeWidth: el.strokeWidth, dash: dash(el.strokeStyle) };

  switch (el.type) {
    case 'rect':
      return (
        <>
          <Rect width={w} height={h} fill={fill} cornerRadius={el.cornerRadius ?? 4} {...common} />
          {boxLabel(el, theme, w, h)}
        </>
      );
    case 'ellipse':
      return (
        <>
          <Ellipse x={w / 2} y={h / 2} radiusX={w / 2} radiusY={h / 2} fill={fill} {...common} />
          {boxLabel(el, theme, w, h)}
        </>
      );
    case 'diamond':
      return (
        <>
          <RegularPolygon x={w / 2} y={h / 2} sides={4} radius={Math.max(w, h) / 2} fill={fill} {...common} />
          {boxLabel(el, theme, w, h)}
        </>
      );
    case 'triangle':
      return (
        <>
          <RegularPolygon x={w / 2} y={h / 2} sides={3} radius={Math.max(w, h) / 2} fill={fill} {...common} />
          {boxLabel(el, theme, w, h)}
        </>
      );
    case 'star':
      return (
        <>
          <Star
            x={w / 2}
            y={h / 2}
            numPoints={5}
            innerRadius={Math.max(w, h) / 4}
            outerRadius={Math.max(w, h) / 2}
            fill={fill}
            {...common}
          />
          {boxLabel(el, theme, w, h)}
        </>
      );
    case 'sticky':
      return (
        <>
          <Rect
            width={w}
            height={h}
            fill={fill}
            stroke={el.stroke === 'auto' ? undefined : stroke}
            cornerRadius={8}
            shadowColor="#1A1A22"
            shadowOpacity={0.12}
            shadowBlur={8}
            shadowOffsetY={2}
          />
          <Text
            text={el.text ?? ''}
            x={12}
            y={12}
            width={w - 24}
            height={h - 24}
            align={el.textAlign ?? 'left'}
            fontSize={el.fontSize ?? 16}
            fontFamily={fontFamilyOf(el)}
            fontStyle={fontStyleOf(el)}
            fill={resolveLabelColor(el.textColor, el.fill, theme)}
          />
        </>
      );
    case 'text': {
      // A text element draws directly on the canvas (transparent fill), so its
      // color follows: explicit textColor → legacy stroke-as-color → theme ink.
      const textFill = el.textColor && el.textColor !== 'auto' ? el.textColor : stroke;
      if (el.markdown) {
        const blocks = parseMarkdownBlocks(el.text ?? '');
        return <>{renderMarkdownBlocks(blocks, el.fontSize ?? 20, w, textFill, theme, fontFamilyOf(el))}</>;
      }
      return (
        <Text
          text={el.text ?? ''}
          width={w}
          align={el.textAlign ?? 'left'}
          fontSize={el.fontSize ?? 20}
          fontFamily={fontFamilyOf(el)}
          fontStyle={fontStyleOf(el)}
          fill={textFill}
        />
      );
    }
    case 'code':
      return (
        <>
          <Rect width={w} height={h} fill={fill ?? '#1E1E26'} stroke={el.stroke} strokeWidth={1} cornerRadius={6} />
          <Text
            text={el.language ?? 'code'}
            x={w - 44}
            y={8}
            width={36}
            align="right"
            fontSize={10}
            fontFamily='"JetBrains Mono", monospace'
            fill="#8A8A96"
            listening={false}
          />
          <Text
            text={el.text ?? ''}
            x={12}
            y={12}
            width={w - 24}
            height={h - 24}
            fontSize={el.fontSize ?? 13}
            fontFamily='"JetBrains Mono", monospace'
            fill="#E4E4E7"
            lineHeight={1.4}
            listening={false}
          />
        </>
      );
    case 'frame': {
      const frameFill = resolveFrameFill(theme);
      const frameBorder = resolveFrameBorder(el.stroke, theme);
      const labelColor = resolveStroke('auto', theme);
      return (
        <>
          {/* Clip rendering is DEFERRED — Konva clip needs a wrapping clipped Group that conflicts with flat per-element render. */}
          <Rect
            width={w}
            height={h}
            fill={frameFill}
            stroke={frameBorder}
            strokeWidth={1.5}
            cornerRadius={6}
            listening={true}
          />
          <Text
            text={el.name ?? 'Frame'}
            x={0}
            y={-22}
            fontSize={13}
            fontFamily="Inter"
            fontStyle="bold"
            fill={labelColor}
            listening={false}
          />
        </>
      );
    }
    case 'mindnode': {
      const nodeFill = resolveMindNodeFill(el.fill, theme, el.collapsed ?? false);
      const nodeBorder = resolveMindNodeBorder(el.stroke, theme);
      const textColor = resolveLabelColor(el.textColor, nodeFill, theme);
      return (
        <>
          <Rect
            width={w}
            height={h}
            fill={nodeFill}
            stroke={nodeBorder}
            strokeWidth={1.5}
            cornerRadius={22}
            listening={true}
          />
          <Text
            text={el.text ?? 'Idea'}
            width={w}
            height={h}
            align={el.textAlign ?? 'center'}
            verticalAlign="middle"
            padding={8}
            fontSize={el.fontSize ?? 14}
            fontFamily={fontFamilyOf(el)}
            fontStyle={fontStyleOf(el)}
            fill={textColor}
            listening={false}
          />
        </>
      );
    }
    case 'line':
      return <Line points={el.points ?? []} {...common} lineCap="round" hitStrokeWidth={12} />;
    case 'freehand':
      return (
        <Line {...common} points={el.points ?? []} lineCap="round" lineJoin="round" tension={0.4} hitStrokeWidth={12} />
      );
    default:
      return <Rect width={w} height={h} fill={fill} {...common} />;
  }
}
