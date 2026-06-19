/**
 * Konva renderer for the `embed` element type (link-preview card).
 *
 * Layout: rounded card surface → favicon image (top-left, 16px) →
 * title Text (bold, truncated) → host Text (muted, smaller).
 *
 * Favicon is fetched via Google's favicon service. On load failure (or while
 * loading) a neutral placeholder square is shown — no crash.
 */
import { useEffect, useState } from 'react';
import { Group, Image as KonvaImage, Rect, Text } from 'react-konva';
import type { CanvasElement } from '@syncflow/shared';
import { resolveStroke, type Theme } from '../model/colors';

/** Minimal image loader — same pattern as ImageInner. */
function useImage(url: string | undefined): HTMLImageElement | undefined {
  const [img, setImg] = useState<HTMLImageElement>();
  useEffect(() => {
    if (!url) {
      setImg(undefined);
      return;
    }
    const i = new window.Image();
    // Request the favicon CORS-enabled (Google's service sends
    // Access-Control-Allow-Origin: *) so the bytes don't taint the Konva
    // canvas — otherwise a later toDataURL() export (M5) would throw.
    i.crossOrigin = 'anonymous';
    i.onload = () => setImg(i);
    // On error (network blocked, CORS, etc.) we intentionally leave img
    // undefined so the placeholder Rect renders instead — no crash.
    i.onerror = () => setImg(undefined);
    i.src = url;
  }, [url]);
  return img;
}

/** Theme-aware surface and border colours for the card. */
const CARD_SURFACE: Record<Theme, string> = { light: '#FFFFFF', dark: '#1E1E26' };
const CARD_BORDER: Record<Theme, string> = { light: '#E2E2DA', dark: '#2E2E38' };
const FAVICON_PLACEHOLDER: Record<Theme, string> = { light: '#D4D4CC', dark: '#3A3A44' };
const MUTED_TEXT: Record<Theme, string> = { light: '#8A8A96', dark: '#7A7A88' };

const PAD = 10; // card internal padding
const FAVICON = 16; // favicon square size
const TITLE_X = PAD + FAVICON + 6; // title / host text left edge

interface Props {
  element: CanvasElement;
  theme: Theme;
}

export function EmbedCardInner({ element, theme }: Props): JSX.Element {
  const w = element.width ?? 240;
  const h = element.height ?? 72;

  const faviconImg = useImage(element.faviconUrl);

  const surface = CARD_SURFACE[theme];
  const border = CARD_BORDER[theme];
  const ink = resolveStroke('auto', theme);
  const muted = MUTED_TEXT[theme];
  const faviconPlaceholder = FAVICON_PLACEHOLDER[theme];

  // Host label: strip protocol and www. from url for display
  const hostLabel = (() => {
    const raw = element.url ?? '';
    try {
      const host = new URL(raw).hostname;
      return host.replace(/^www\./i, '');
    } catch {
      return raw;
    }
  })();

  const titleY = PAD;
  const hostY = PAD + 18; // below the title line

  return (
    <Group>
      {/* Card surface */}
      <Rect
        width={w}
        height={h}
        fill={surface}
        stroke={border}
        strokeWidth={1}
        cornerRadius={8}
        shadowColor="#1A1A22"
        shadowOpacity={0.08}
        shadowBlur={6}
        shadowOffsetY={2}
        listening={false}
      />

      {/* Favicon: placeholder square while loading / on error */}
      {faviconImg ? (
        <KonvaImage
          image={faviconImg}
          x={PAD}
          y={PAD}
          width={FAVICON}
          height={FAVICON}
          cornerRadius={3}
          listening={false}
        />
      ) : (
        <Rect
          x={PAD}
          y={PAD}
          width={FAVICON}
          height={FAVICON}
          fill={faviconPlaceholder}
          cornerRadius={3}
          listening={false}
        />
      )}

      {/* Title — bold, truncated to available width */}
      <Text
        text={element.title ?? hostLabel}
        x={TITLE_X}
        y={titleY}
        width={Math.max(1, w - TITLE_X - PAD)}
        fontSize={13}
        fontFamily="Inter"
        fontStyle="bold"
        fill={ink}
        ellipsis
        wrap="none"
        listening={false}
      />

      {/* Host URL — muted, smaller */}
      <Text
        text={hostLabel}
        x={TITLE_X}
        y={hostY}
        width={Math.max(1, w - TITLE_X - PAD)}
        fontSize={11}
        fontFamily="Inter"
        fill={muted}
        ellipsis
        wrap="none"
        listening={false}
      />
    </Group>
  );
}
