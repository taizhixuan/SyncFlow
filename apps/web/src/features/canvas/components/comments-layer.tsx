/**
 * comments-layer.tsx — Konva overlay rendering comment pins on the canvas.
 *
 * Each unresolved comment renders as a small badge at:
 *  - element comments: top-right corner of the element's bounding box
 *  - board-point comments: at their absolute (x, y)
 *
 * Clicking a pin opens that thread in the comments panel by setting
 * openCommentId on the store.
 */

import { Circle, Group, Layer, Text } from 'react-konva';
import { useStore } from 'zustand';
import type { Comment } from '@syncflow/shared';
import type { CanvasStore } from '../engine/canvas-store';
import { getBounds } from '../model/element';

interface Props {
  store: CanvasStore;
  /** Current canvas scale (view.scale) so we can counter-scale the pins. */
  scale: number;
}

const PIN_RADIUS = 12;
const PIN_COLOR = '#3B5BFF';
const PIN_RESOLVED_COLOR = '#9CA3AF';

function pinPosition(comment: Comment, elements: Record<string, import('@syncflow/shared').CanvasElement>): { x: number; y: number } | null {
  if (comment.elementId) {
    const el = elements[comment.elementId];
    if (!el) return null;
    const bounds = getBounds(el);
    return { x: bounds.x + bounds.width, y: bounds.y };
  }
  if (comment.point) {
    return comment.point;
  }
  return null;
}

export function CommentsLayer({ store, scale }: Props): JSX.Element {
  const comments = useStore(store, (s) => s.comments);
  const doc = useStore(store, (s) => s.doc);
  const openCommentId = useStore(store, (s) => s.openCommentId);
  const s = store.getState();

  // counter-scale so pins remain the same visual size regardless of zoom
  const cs = 1 / scale;

  return (
    <Layer listening={true}>
      {comments.map((comment) => {
        const pos = pinPosition(comment, doc.elements);
        if (!pos) return null;
        const isOpen = comment.id === openCommentId;
        const color = comment.resolved ? PIN_RESOLVED_COLOR : isOpen ? '#1D40C1' : PIN_COLOR;
        const replyCount = comment.replies.length;
        const label = replyCount > 0 ? String(replyCount + 1) : '1';

        return (
          <Group
            key={comment.id}
            x={pos.x}
            y={pos.y}
            scaleX={cs}
            scaleY={cs}
            offsetX={PIN_RADIUS}
            offsetY={PIN_RADIUS}
            listening={true}
            onClick={() => {
              s.setOpenCommentId(comment.id === openCommentId ? null : comment.id);
            }}
            onTap={() => {
              s.setOpenCommentId(comment.id === openCommentId ? null : comment.id);
            }}
            style={{ cursor: 'pointer' } as React.CSSProperties}
          >
            <Circle
              radius={PIN_RADIUS}
              fill={color}
              shadowBlur={isOpen ? 6 : 0}
              shadowColor="rgba(0,0,0,0.3)"
            />
            <Text
              text={label}
              fontSize={10}
              fontFamily="Inter, sans-serif"
              fontStyle="bold"
              fill="#FFFFFF"
              width={PIN_RADIUS * 2}
              height={PIN_RADIUS * 2}
              offsetX={PIN_RADIUS}
              offsetY={PIN_RADIUS}
              align="center"
              verticalAlign="middle"
              listening={false}
            />
          </Group>
        );
      })}
    </Layer>
  );
}
