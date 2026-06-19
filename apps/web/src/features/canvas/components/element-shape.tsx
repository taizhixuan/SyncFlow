import { Ellipse, Group, Line, Rect, Text } from 'react-konva';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { CanvasElement, CanvasElementPatch } from '@syncflow/shared';

interface Props {
  element: CanvasElement;
  draggable: boolean;
  onSelect: () => void;
  onChange: (patch: CanvasElementPatch) => void;
  onEditText: () => void;
  registerNode: (id: string, node: Konva.Group | null) => void;
}

export function ElementShape({
  element,
  draggable,
  onSelect,
  onChange,
  onEditText,
  registerNode,
}: Props): JSX.Element {
  const fill = element.fill ?? undefined;
  const w = element.width ?? 0;
  const h = element.height ?? 0;

  function handleDragEnd(e: KonvaEventObject<DragEvent>): void {
    onChange({ x: e.target.x(), y: e.target.y() });
  }

  function handleTransformEnd(e: KonvaEventObject<Event>): void {
    const node = e.target;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    node.scaleX(1);
    node.scaleY(1);
    onChange({
      x: node.x(),
      y: node.y(),
      rotation: node.rotation(),
      width: Math.max(5, w * scaleX),
      height: Math.max(5, h * scaleY),
    });
  }

  return (
    <Group
      id={element.id}
      name="element"
      x={element.x}
      y={element.y}
      rotation={element.rotation}
      opacity={element.opacity}
      draggable={draggable}
      onMouseDown={onSelect}
      onTap={onSelect}
      onDblClick={element.type === 'text' || element.type === 'sticky' ? onEditText : undefined}
      onDblTap={element.type === 'text' || element.type === 'sticky' ? onEditText : undefined}
      onDragEnd={handleDragEnd}
      onTransformEnd={handleTransformEnd}
      ref={(node) => registerNode(element.id, node)}
    >
      {element.type === 'rect' && (
        <Rect width={w} height={h} fill={fill} stroke={element.stroke} strokeWidth={element.strokeWidth} cornerRadius={4} />
      )}

      {element.type === 'ellipse' && (
        <Ellipse
          x={w / 2}
          y={h / 2}
          radiusX={w / 2}
          radiusY={h / 2}
          fill={fill}
          stroke={element.stroke}
          strokeWidth={element.strokeWidth}
        />
      )}

      {element.type === 'sticky' && (
        <>
          <Rect width={w} height={h} fill={fill} stroke={element.stroke} strokeWidth={1} cornerRadius={8} shadowColor="#1A1A22" shadowOpacity={0.12} shadowBlur={8} shadowOffsetY={2} />
          <Text text={element.text ?? ''} x={12} y={12} width={w - 24} height={h - 24} fontSize={element.fontSize ?? 16} fontFamily="Inter" fill="#1A1A22" />
        </>
      )}

      {element.type === 'text' && (
        <Text text={element.text ?? ''} width={w} fontSize={element.fontSize ?? 20} fontFamily="Inter" fill={element.stroke} />
      )}

      {element.type === 'line' && (
        <Line points={element.points ?? []} stroke={element.stroke} strokeWidth={element.strokeWidth} lineCap="round" hitStrokeWidth={12} />
      )}

      {element.type === 'freehand' && (
        <Line points={element.points ?? []} stroke={element.stroke} strokeWidth={element.strokeWidth} lineCap="round" lineJoin="round" tension={0.4} hitStrokeWidth={12} />
      )}
    </Group>
  );
}
