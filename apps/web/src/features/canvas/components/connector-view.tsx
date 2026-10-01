import { Arrow } from 'react-konva';
import type { CanvasElement } from '@syncflow/shared';
import { resolveConnector } from '../model/connector';
import { resolveSelectionColor, resolveStroke, type Theme } from '../model/colors';

interface Props {
  connector: CanvasElement;
  elements: Record<string, CanvasElement>;
  theme: Theme;
  selected: boolean;
  /** Whether the current tool/mode allows moving elements at all. */
  canDrag: boolean;
  onSelect(additive: boolean): void;
  /** Translate a free (unbound) connector by a drag delta in canvas coords. */
  onMove(dx: number, dy: number): void;
}

export function ConnectorView({
  connector,
  elements,
  theme,
  selected,
  canDrag,
  onSelect,
  onMove,
}: Props): JSX.Element {
  const { from, to } = resolveConnector(connector, elements);
  const stroke = resolveStroke(connector.stroke, theme);
  // A connector bound to elements follows them; only free arrows can be dragged.
  const free = !connector.from?.elementId && !connector.to?.elementId;
  return (
    <Arrow
      id={connector.id}
      name="connector"
      points={[from.x, from.y, to.x, to.y]}
      stroke={selected ? resolveSelectionColor(theme) : stroke}
      fill={selected ? resolveSelectionColor(theme) : stroke}
      strokeWidth={connector.strokeWidth}
      pointerLength={10}
      pointerWidth={10}
      pointerAtBeginning={connector.startArrow ?? false}
      pointerAtEnding={connector.endArrow ?? true}
      hitStrokeWidth={14}
      draggable={canDrag && free && !connector.locked}
      onMouseDown={(e) => onSelect(e.evt.shiftKey)}
      onTap={() => onSelect(false)}
      onDragEnd={(e) => {
        const dx = e.target.x();
        const dy = e.target.y();
        e.target.position({ x: 0, y: 0 });
        if (dx !== 0 || dy !== 0) onMove(dx, dy);
      }}
    />
  );
}
