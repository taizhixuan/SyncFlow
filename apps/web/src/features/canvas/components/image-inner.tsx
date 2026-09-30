import { useEffect, useState } from 'react';
import { Group, Image as KonvaImage, Line, Rect, Text } from 'react-konva';
import type { CanvasElement } from '@syncflow/shared';

export type ImageStatus = 'idle' | 'loading' | 'loaded' | 'error';

/**
 * Load an image for Konva. A load that settles after the url changed (or the
 * element unmounted) is dropped, so a slow earlier asset can never overwrite
 * the current one.
 */
export function useImage(url: string | undefined): {
  image: HTMLImageElement | undefined;
  status: ImageStatus;
} {
  const [state, setState] = useState<{ image: HTMLImageElement | undefined; status: ImageStatus }>(
    () => ({ image: undefined, status: url ? 'loading' : 'idle' }),
  );
  useEffect(() => {
    if (!url) {
      setState({ image: undefined, status: 'idle' });
      return;
    }
    let current = true;
    setState({ image: undefined, status: 'loading' });
    const i = new window.Image();
    i.crossOrigin = 'anonymous';
    i.onload = () => {
      if (current) setState({ image: i, status: 'loaded' });
    };
    i.onerror = () => {
      if (!current) return;
      console.warn('[canvas] image failed to load', url.startsWith('data:') ? 'data URL' : url);
      setState({ image: undefined, status: 'error' });
    };
    i.src = url;
    return () => {
      current = false;
      i.onload = null;
      i.onerror = null;
    };
  }, [url]);
  return state;
}

export function ImageInner({ element }: { element: CanvasElement }): JSX.Element {
  const { image, status } = useImage(element.assetUrl);
  const w = element.width ?? 0;
  const h = element.height ?? 0;
  if (image) return <KonvaImage image={image} width={w} height={h} cornerRadius={4} />;
  if (status === 'error' || status === 'idle') {
    // Visibly broken rather than an ambiguous grey box: dashed frame, a cross
    // and a label, so a missing asset reads as a failure, not as "loading".
    return (
      <Group>
        <Rect
          width={w}
          height={h}
          fill="#FDECEC"
          stroke="#D14343"
          strokeWidth={1.5}
          dash={[6, 4]}
          cornerRadius={4}
        />
        <Line points={[0, 0, w, h]} stroke="#D14343" strokeWidth={1} opacity={0.35} listening={false} />
        <Line points={[w, 0, 0, h]} stroke="#D14343" strokeWidth={1} opacity={0.35} listening={false} />
        <Text
          text="Image unavailable"
          width={w}
          height={h}
          align="center"
          verticalAlign="middle"
          fontSize={Math.max(10, Math.min(14, w / 10))}
          fill="#A12C2C"
          listening={false}
        />
      </Group>
    );
  }
  return <Rect width={w} height={h} fill="#E7E7E2" cornerRadius={4} />;
}
