import { memo, useCallback } from 'react';
import { Group } from 'react-konva';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { CanvasElement } from '@syncflow/shared';
import type { Theme } from '../model/colors';
import { renderElement } from '../elements/shape-renderers';
import { ImageInner } from './image-inner';
import { EmbedCardInner } from './embed-card-inner';

/**
 * Every callback takes the element back as an argument rather than closing over
 * it. That lets the parent define them once with empty dependency arrays, which
 * is the precondition for the `memo` below doing anything: a fresh arrow per
 * render would fail the props comparison every time and re-render all N shapes
 * whenever any one of them moved.
 */
interface Props {
  element: CanvasElement;
  theme: Theme;
  draggable: boolean;
  onSelect(element: CanvasElement, additive: boolean): void;
  /** Fires on a plain click (no drag); used to collapse a multi-selection to this element. */
  onClick(element: CanvasElement, additive: boolean): void;
  onEdit(element: CanvasElement): void;
  onDragStart(node: Konva.Group, element: CanvasElement): void;
  onDragMove(node: Konva.Group, element: CanvasElement): void;
  onDragEnd(node: Konva.Group, element: CanvasElement): void;
  registerNode(id: string, node: Konva.Group | null): void;
  /**
   * When a tag filter is active and this element does NOT match the filter,
   * pass a reduced opacity value (e.g. 0.2) to dim it visually.
   * Undefined means no filter is active — use element.opacity as-is.
   */
  filterOpacity?: number;
}

function ElementViewImpl({
  element,
  theme,
  draggable,
  onSelect,
  onClick,
  onEdit,
  onDragStart,
  onDragMove,
  onDragEnd,
  registerNode,
  filterOpacity,
}: Props): JSX.Element {
  const effectiveOpacity = filterOpacity !== undefined ? filterOpacity : element.opacity;
  // A fresh ref callback would make React detach and re-attach the Konva node
  // on every render; keyed on the id it only runs when the node really changes.
  const handleRef = useCallback(
    (node: Konva.Group | null) => registerNode(element.id, node),
    [element.id, registerNode],
  );
  return (
    <Group
      id={element.id}
      name="element"
      x={element.x}
      y={element.y}
      rotation={element.rotation}
      opacity={effectiveOpacity}
      draggable={draggable && !element.locked}
      onMouseDown={(e: KonvaEventObject<MouseEvent>) => onSelect(element, e.evt.shiftKey)}
      onClick={(e: KonvaEventObject<MouseEvent>) => onClick(element, e.evt.shiftKey)}
      onTap={() => onSelect(element, false)}
      onDblClick={() => onEdit(element)}
      onDblTap={() => onEdit(element)}
      onDragStart={(e) => onDragStart(e.target as Konva.Group, element)}
      onDragMove={(e) => onDragMove(e.target as Konva.Group, element)}
      onDragEnd={(e) => onDragEnd(e.target as Konva.Group, element)}
      ref={handleRef}
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

/**
 * Shallow prop comparison is enough because the Yjs projection hands back the
 * SAME element object when nothing about that element changed (see
 * `toPlainDoc`). Dragging one shape on a 500-shape board therefore re-renders
 * one `ElementView`, not 500.
 */
export const ElementView = memo(ElementViewImpl);
