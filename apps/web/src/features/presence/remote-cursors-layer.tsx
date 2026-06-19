import { useState, useEffect } from 'react';
import { Circle, Group, Layer, Path, Rect, Tag, Text, Label } from 'react-konva';
import { useStore } from 'zustand';
import type { Awareness } from 'y-protocols/awareness';
import { usePresence } from './use-presence';
import { getBounds } from '@/features/canvas/model/element';
import type { CanvasStore } from '@/features/canvas/engine/canvas-store';

/**
 * Non-interactive Konva overlay rendering remote collaborators' cursors and
 * selection outlines. It lives INSIDE the view-transformed Stage, so it draws
 * in raw canvas coords; the cursor pointer/label are counter-scaled by the
 * current zoom so they stay a constant on-screen size.
 */
export function RemoteCursorsLayer({
  awareness,
  store,
}: {
  awareness: Awareness;
  store: CanvasStore;
}): JSX.Element {
  const remotes = usePresence(awareness);
  const view = useStore(store, (s) => s.view);
  const doc = useStore(store, (s) => s.doc);
  const inv = 1 / view.scale;

  // Tick at 100ms while any remote laser is active so opacity fades smoothly.
  const [, setTick] = useState(0);
  const hasLaser = remotes.some((r) => r.laser != null);
  useEffect(() => {
    if (!hasLaser) return;
    const id = setInterval(() => setTick((t) => t + 1), 100);
    return () => clearInterval(id);
  }, [hasLaser]);

  const LASER_FADE_MS = 1000;

  return (
    <Layer listening={false}>
      {remotes.map(({ user, cursor, selection, laser }) => {
        const color = user.color;
        return (
          <Group key={user.id}>
            {selection.map((id) => {
              const el = doc.elements[id];
              if (!el) return null;
              const b = getBounds(el);
              return (
                <Rect
                  key={`${user.id}-sel-${id}`}
                  x={b.x}
                  y={b.y}
                  width={b.width}
                  height={b.height}
                  stroke={color}
                  strokeWidth={1.5 * inv}
                  dash={[6 * inv, 4 * inv]}
                  listening={false}
                />
              );
            })}
            {cursor && (
              <Group x={cursor.x} y={cursor.y} scaleX={inv} scaleY={inv}>
                <Path data="M3 3 L19 10 L11 12 L9 19 Z" fill={color} />
                <Label x={16} y={6}>
                  <Tag fill={color} cornerRadius={4} />
                  <Text text={user.name} fill="#ffffff" fontSize={11} padding={4} fontStyle="bold" />
                </Label>
              </Group>
            )}
            {(() => {
              if (!laser) return null;
              const age = Date.now() - laser.t;
              if (age > LASER_FADE_MS) return null;
              const opacity = 1 - age / LASER_FADE_MS;
              return (
                <Circle
                  key={`${user.id}-laser`}
                  x={laser.x}
                  y={laser.y}
                  radius={6 * inv}
                  fill={color}
                  opacity={opacity}
                  shadowColor={color}
                  shadowBlur={8 * inv}
                  shadowOpacity={0.6}
                  listening={false}
                />
              );
            })()}
          </Group>
        );
      })}
    </Layer>
  );
}
