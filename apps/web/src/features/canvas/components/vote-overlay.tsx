/**
 * vote-overlay.tsx — Konva overlay rendering vote badges and emoji reactions.
 *
 * For each element that has votes or reactions, renders:
 *   - A dot-vote badge (blue circle with count) at the top-left of the element
 *   - An emoji reactions row below the vote badge
 *
 * Counter-scaled like comments-layer so badges stay the same visual size
 * regardless of zoom level. In voting mode, renders a highlight glow on the
 * top-voted elements.
 */

import { Circle, Group, Layer, Rect, Text } from 'react-konva';
import { useStore } from 'zustand';
import type { CanvasElement } from '@syncflow/shared';
import type { CanvasStore } from '../engine/canvas-store';
import { getBounds } from '../model/element';
import { resolveVoteColor, resolveTopVoteGlow } from '../model/colors';
import { totalVotes, reactionSummary, topVotedIds } from '../model/voting';

interface Props {
  store: CanvasStore;
  /** Current canvas scale (view.scale) so we can counter-scale the badges. */
  scale: number;
}
const BADGE_RADIUS = 10;
const EMOJI_FONT = 11;
const EMOJI_BADGE_H = 16;
const EMOJI_BADGE_PAD = 4;

/** Anchor position: top-right corner of an element's bounding box. */
function badgeAnchor(el: CanvasElement): { x: number; y: number } {
  const bounds = getBounds(el);
  return { x: bounds.x + bounds.width, y: bounds.y };
}

export function VoteOverlay({ store, scale }: Props): JSX.Element {
  const doc = useStore(store, (s) => s.doc);
  const votingMode = useStore(store, (s) => s.votingMode);
  const theme = useStore(store, (s) => s.theme);

  const voteColor = resolveVoteColor(theme);
  const topVoteGlow = resolveTopVoteGlow(theme);

  const elements = Object.values(doc.elements);
  // Only render badges on elements that have at least one vote or reaction.
  const annotated = elements.filter((el) => totalVotes(el) > 0 || (el.reactions && Object.keys(el.reactions).length > 0));

  // In voting mode, compute top-voted ids for the glow highlight.
  const topIds = votingMode ? new Set(topVotedIds(elements, 3)) : new Set<string>();

  // Counter-scale: badges remain the same pixel size regardless of canvas zoom.
  const cs = 1 / scale;

  return (
    <Layer listening={false}>
      {/* Glow highlight for top-voted elements in voting mode */}
      {votingMode &&
        elements
          .filter((el) => topIds.has(el.id))
          .map((el) => {
            const bounds = getBounds(el);
            return (
              <Rect
                key={`glow-${el.id}`}
                x={bounds.x - 4}
                y={bounds.y - 4}
                width={bounds.width + 8}
                height={bounds.height + 8}
                fill="transparent"
                stroke={topVoteGlow}
                strokeWidth={3 * cs}
                cornerRadius={6 * cs}
                shadowBlur={12 * cs}
                shadowColor={topVoteGlow}
                shadowOpacity={0.6}
                listening={false}
              />
            );
          })}

      {/* Vote + reaction badges */}
      {annotated.map((el) => {
        const pos = badgeAnchor(el);
        const votes = totalVotes(el);
        const summary = reactionSummary(el);

        return (
          <Group
            key={`vote-${el.id}`}
            x={pos.x}
            y={pos.y}
            scaleX={cs}
            scaleY={cs}
            offsetX={BADGE_RADIUS}
            offsetY={BADGE_RADIUS}
            listening={false}
          >
            {/* Vote dot badge */}
            {votes > 0 && (
              <Group>
                <Circle radius={BADGE_RADIUS} fill={voteColor} shadowBlur={4} shadowColor="rgba(0,0,0,0.3)" />
                <Text
                  text={String(votes)}
                  fontSize={9}
                  fontFamily="Inter, sans-serif"
                  fontStyle="bold"
                  fill="#FFFFFF"
                  width={BADGE_RADIUS * 2}
                  height={BADGE_RADIUS * 2}
                  offsetX={BADGE_RADIUS}
                  offsetY={BADGE_RADIUS}
                  align="center"
                  verticalAlign="middle"
                  listening={false}
                />
              </Group>
            )}

            {/* Emoji reaction badges row — rendered below the vote badge */}
            {summary.map(({ emoji, count }, i) => {
              const offsetY = votes > 0 ? BADGE_RADIUS * 2 + 4 + i * (EMOJI_BADGE_H + 2) : i * (EMOJI_BADGE_H + 2);
              const labelText = `${emoji}${count > 1 ? ` ${count}` : ''}`;
              const labelWidth = EMOJI_BADGE_PAD * 2 + (labelText.length * EMOJI_FONT * 0.65);
              return (
                <Group key={emoji} y={offsetY}>
                  <Rect
                    x={-labelWidth / 2}
                    width={labelWidth}
                    height={EMOJI_BADGE_H}
                    fill="rgba(0,0,0,0.55)"
                    cornerRadius={EMOJI_BADGE_H / 2}
                    listening={false}
                  />
                  <Text
                    text={labelText}
                    fontSize={EMOJI_FONT}
                    fontFamily="Inter, sans-serif"
                    fill="#FFFFFF"
                    width={labelWidth}
                    height={EMOJI_BADGE_H}
                    x={-labelWidth / 2}
                    align="center"
                    verticalAlign="middle"
                    listening={false}
                  />
                </Group>
              );
            })}
          </Group>
        );
      })}
    </Layer>
  );
}
