import type { CanvasElement, ElementType } from '@syncflow/shared';
import { getBounds, isBoxType, type Rect } from '../model/element';

export interface ElementMeta {
  getBounds(el: CanvasElement): Rect;
  resizable: boolean;
}

export function metaFor(type: ElementType): ElementMeta {
  return { getBounds, resizable: isBoxType(type) };
}
