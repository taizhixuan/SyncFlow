import { Shape } from 'react-konva';
import type Konva from 'konva';
import { laserLife, laserRibbon, smoothLaser, type LaserPoint } from '../model/laser';

export { LASER_FADE_MS, type LaserPoint } from '../model/laser';

/** Screen-pixel widths of the three passes: glow, colour body, white core. */
const GLOW_PX = 18;
const BODY_PX = 7;
const CORE_PX = 2.6;

/**
 * A laser pointer stroke, drawn as one continuous comet: a soft glow and a
 * body in the presenter's colour under a white-hot core, all tapering to
 * nothing towards the tail. One custom Konva shape draws the whole ribbon, so
 * there are no seams between samples. Sizes are divided by the zoom so the
 * laser looks the same at any scale.
 */
export function LaserTrail({
  points,
  color,
  scale,
  now,
}: {
  points: readonly LaserPoint[];
  color: string;
  scale: number;
  now: number;
}): JSX.Element | null {
  const head = points[points.length - 1];
  if (!head) return null;
  const headLife = laserLife(head, now);
  if (headLife <= 0) return null;
  const trail = smoothLaser(points);
  const inv = 1 / scale;

  const sceneFunc = (context: Konva.Context): void => {
    const ctx = context._context;
    // shadowBlur ignores the canvas transform, so scale it by the pixel ratio.
    const ratio = context.getCanvas().getPixelRatio();
    const pass = (widthPx: number, fill: string, alpha: number, glowPx = 0): void => {
      ctx.save();
      ctx.globalAlpha = alpha * headLife;
      ctx.fillStyle = fill;
      if (glowPx) {
        ctx.shadowColor = color;
        ctx.shadowBlur = glowPx * ratio;
      }
      const outline = laserRibbon(trail, now, widthPx * inv);
      ctx.beginPath();
      if (outline.length >= 4) {
        ctx.moveTo(outline[0]!, outline[1]!);
        for (let i = 2; i < outline.length; i += 2) ctx.lineTo(outline[i]!, outline[i + 1]!);
        ctx.closePath();
      }
      // The head is a round cap of the same width, so the tip is never square.
      ctx.moveTo(head.x + (widthPx / 2) * inv, head.y);
      ctx.arc(head.x, head.y, (widthPx / 2) * inv, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };
    pass(GLOW_PX, color, 0.32, 22);
    pass(BODY_PX, color, 0.95, 8);
    pass(CORE_PX, '#FFFFFF', 1);
  };

  return <Shape sceneFunc={sceneFunc} listening={false} perfectDrawEnabled={false} />;
}
