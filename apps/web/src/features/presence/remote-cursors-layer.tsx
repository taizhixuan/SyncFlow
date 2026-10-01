import { useState, useEffect, useRef } from 'react';
import { Group, Layer, Path, Rect, Tag, Text, Label } from 'react-konva';
import { useStore } from 'zustand';
import type { Awareness } from 'y-protocols/awareness';
import { usePresence } from './use-presence';
import { getBounds } from '@/features/canvas/model/element';
import type { CanvasStore } from '@/features/canvas/engine/canvas-store';
import { LASER_FADE_MS, LaserTrail, type LaserPoint } from '@/features/canvas/components/laser-trail';

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

  // Awareness only carries each presenter's latest laser point. Keep a short
  // history per client so it draws as a trail, stamped with OUR clock: that
  // also sidesteps clock skew between the presenter's machine and this one.
  const trails = useRef(new Map<number, { key: string; points: LaserPoint[] }>());
  const now = Date.now();
  for (const { clientId, laser } of remotes) {
    if (!laser) continue;
    const key = `${laser.x},${laser.y},${laser.t}`;
    const entry = trails.current.get(clientId) ?? { key: '', points: [] };
    if (entry.key === key) continue;
    entry.key = key;
    entry.points = [...entry.points, { x: laser.x, y: laser.y, t: now }]
      .filter((q) => now - q.t < LASER_FADE_MS)
      .slice(-80);
    trails.current.set(clientId, entry);
  }
  const liveLaser = [...trails.current.values()].some((e) => e.points.some((q) => now - q.t < LASER_FADE_MS));

  // Repaint at ~30fps while any trail is still fading, so it decays smoothly.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!liveLaser) return;
    const id = setInterval(() => setTick((t) => t + 1), 33);
    return () => clearInterval(id);
  }, [liveLaser]);

  return (
    <Layer listening={false}>
      {remotes.map(({ clientId, user, cursor, selection }) => {
        const color = user.color;
        return (
          <Group key={clientId}>
            {selection.map((id) => {
              const el = doc.elements[id];
              if (!el) return null;
              const b = getBounds(el);
              return (
                <Rect
                  key={`${clientId}-sel-${id}`}
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
              const points = trails.current.get(clientId)?.points;
              return points ? <LaserTrail points={points} color={color} scale={view.scale} now={now} /> : null;
            })()}
          </Group>
        );
      })}
    </Layer>
  );
}
