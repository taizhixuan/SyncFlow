import { Group } from 'react-konva';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { CanvasElement, CanvasElementPatch } from '@syncflow/shared';
import type { Theme } from '../model/colors';
import { renderElement } from '../elements/shape-renderers';

interface Props {
  element: CanvasElement;
  theme: Theme;
  draggable: boolean;
  onSelect(additive: boolean): void;
  onChange(patch: CanvasElementPatch): void;
  onEdit(): void;
  onDragMove(node: Konva.Group): void;
  registerNode(id: string, node: Konva.Group | null): void;
}

export function ElementView({
  element,
  theme,
  draggable,
  onSelect,
  onChange,
  onEdit,
  onDragMove,
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
      onDragMove={(e) => onDragMove(e.target as Konva.Group)}
      onDragEnd={(e) => onChange({ x: e.target.x(), y: e.target.y() })}
      ref={(node) => registerNode(element.id, node)}
    >
      {renderElement(element, theme)}
    </Group>
  );
}
