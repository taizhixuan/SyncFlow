import { Group } from 'react-konva';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { CanvasElement } from '@syncflow/shared';
import type { Theme } from '../model/colors';
import { renderElement } from '../elements/shape-renderers';
import { ImageInner } from './image-inner';
import { EmbedCardInner } from './embed-card-inner';

interface Props {
  element: CanvasElement;
  theme: Theme;
  draggable: boolean;
  onSelect(additive: boolean): void;
  onEdit(): void;
  onDragStart(node: Konva.Group): void;
  onDragMove(node: Konva.Group): void;
  onDragEnd(node: Konva.Group): void;
  registerNode(id: string, node: Konva.Group | null): void;
}

export function ElementView({
  element,
  theme,
  draggable,
  onSelect,
  onEdit,
  onDragStart,
  onDragMove,
  onDragEnd,
  registerNode,
}: Props): JSX.Element {
  return (
    <Group
      id={element.id}
      name="element"
      x={element.x}
      y={element.y}
      rotation={element.rotation}
      opacity={element.opacity}
      draggable={draggable && !element.locked}
      onMouseDown={(e: KonvaEventObject<MouseEvent>) => onSelect(e.evt.shiftKey)}
      onTap={() => onSelect(false)}
      onDblClick={onEdit}
      onDblTap={onEdit}
      onDragStart={(e) => onDragStart(e.target as Konva.Group)}
      onDragMove={(e) => onDragMove(e.target as Konva.Group)}
      onDragEnd={(e) => onDragEnd(e.target as Konva.Group)}
      ref={(node) => registerNode(element.id, node)}
    >
      {element.type === 'image' ? (
        <ImageInner element={element} />
      ) : element.type === 'embed' ? (
        <EmbedCardInner element={element} theme={theme} />
      ) : (
        renderElement(element, theme)
      )}
    </Group>
  );
}
