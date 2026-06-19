import { useEffect, useState } from 'react';
import { Image as KonvaImage, Rect } from 'react-konva';
import type { CanvasElement } from '@syncflow/shared';

function useImage(url: string | undefined): HTMLImageElement | undefined {
  const [img, setImg] = useState<HTMLImageElement>();
  useEffect(() => {
    if (!url) {
      setImg(undefined);
      return;
    }
    const i = new window.Image();
    i.crossOrigin = 'anonymous';
    i.onload = () => setImg(i);
    i.src = url;
  }, [url]);
  return img;
}

export function ImageInner({ element }: { element: CanvasElement }): JSX.Element {
  const img = useImage(element.assetUrl);
  const w = element.width ?? 0;
  const h = element.height ?? 0;
  if (!img) return <Rect width={w} height={h} fill="#E7E7E2" cornerRadius={4} />;
  return <KonvaImage image={img} width={w} height={h} cornerRadius={4} />;
}
