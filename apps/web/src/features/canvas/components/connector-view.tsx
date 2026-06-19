import { Arrow } from 'react-konva';
import type { CanvasElement } from '@syncflow/shared';
import { resolveConnector } from '../model/connector';
import { resolveStroke, type Theme } from '../model/colors';

interface Props {
  connector: CanvasElement;
  elements: Record<string, CanvasElement>;
  theme: Theme;
  selected: boolean;
  onSelect(additive: boolean): void;
}

export function ConnectorView({ connector, elements, theme, selected, onSelect }: Props): JSX.Element {
  const { from, to } = resolveConnector(connector, elements);
  const stroke = resolveStroke(connector.stroke, theme);
  return (
    <Arrow
      id={connector.id}
      name="connector"
      points={[from.x, from.y, to.x, to.y]}
      stroke={selected ? '#3B5BFF' : stroke}
      fill={selected ? '#3B5BFF' : stroke}
      strokeWidth={connector.strokeWidth}
      pointerLength={10}
      pointerWidth={10}
      pointerAtBeginning={connector.startArrow ?? false}
      pointerAtEnding={connector.endArrow ?? true}
      hitStrokeWidth={14}
      onMouseDown={(e) => onSelect(e.evt.shiftKey)}
      onTap={() => onSelect(false)}
    />
  );
}
