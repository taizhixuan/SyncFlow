import { Ellipse, Line, Rect, RegularPolygon, Star, Text } from 'react-konva';
import type { ReactNode } from 'react';
import type { CanvasElement } from '@syncflow/shared';
import { resolveFill, resolveStroke, type Theme } from '../model/colors';

const dash = (style?: string): number[] | undefined =>
  style === 'dashed' ? [10, 6] : style === 'dotted' ? [2, 6] : undefined;

/** Centered label rendered inside a box-like shape when it has text. */
function boxLabel(el: CanvasElement, theme: Theme, w: number, h: number): ReactNode {
  if (!el.text) return null;
  return (
    <Text
      text={el.text}
      width={w}
      height={h}
      align="center"
      verticalAlign="middle"
      padding={6}
      fontSize={el.fontSize ?? 16}
      fontFamily="Inter"
      fill={resolveStroke('auto', theme)}
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
            fontSize={el.fontSize ?? 16}
            fontFamily="Inter"
            fill={resolveStroke('auto', theme)}
          />
        </>
      );
    case 'text':
      return <Text text={el.text ?? ''} width={w} fontSize={el.fontSize ?? 20} fontFamily="Inter" fill={stroke} />;
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
