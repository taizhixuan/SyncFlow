import { describe, it, expect, vi } from 'vitest';
import type { ReactElement } from 'react';
import type { CanvasElement } from '@syncflow/shared';

// Konva's Node entry requires the native `canvas` module, which isn't available
// under jsdom. We only inspect the returned element props, so stub the Konva
// components as plain host tags — element type is irrelevant to prop inspection.
vi.mock('react-konva', () => ({
  Rect: 'Rect',
  Ellipse: 'Ellipse',
  Line: 'Line',
  RegularPolygon: 'RegularPolygon',
  Star: 'Star',
  Text: 'Text',
}));

const { renderElement } = await import('./shape-renderers');

/** Recursively collect the props of every React element in a render tree. */
function collectProps(node: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(node)) {
    node.forEach((n) => collectProps(n, out));
    return out;
  }
  if (node && typeof node === 'object' && 'props' in (node as ReactElement)) {
    const el = node as ReactElement;
    out.push(el.props as Record<string, unknown>);
    collectProps((el.props as { children?: unknown }).children, out);
  }
  return out;
}

/** Find the Konva <Text> node whose `text` prop matches the given string. */
function textNode(tree: unknown, text: string): Record<string, unknown> | undefined {
  return collectProps(tree).find((p) => p.text === text);
}

function el(partial: Partial<CanvasElement>): CanvasElement {
  return {
    id: 'e1',
    type: 'rect',
    x: 0,
    y: 0,
    rotation: 0,
    opacity: 1,
    zIndex: 0,
    fill: null,
    stroke: '#1A1A22',
    strokeWidth: 2,
    strokeStyle: 'solid',
    ...partial,
  } as CanvasElement;
}

describe('renderElement label contrast', () => {
  it('renders a dark label on a light-filled shape even in dark theme (no white-on-white)', () => {
    const tree = renderElement(el({ type: 'rect', fill: '#FFFFFF', text: 'Hi', width: 100, height: 60 }), 'dark');
    expect(textNode(tree, 'Hi')?.fill).toBe('#1A1A22');
  });

  it('renders a light label on a dark-filled shape', () => {
    const tree = renderElement(el({ type: 'rect', fill: '#101018', text: 'Hi', width: 100, height: 60 }), 'light');
    expect(textNode(tree, 'Hi')?.fill).toBe('#F4F4F2');
  });

  it('keeps the sticky label dark in dark mode (sticky fill is pale)', () => {
    const tree = renderElement(el({ type: 'sticky', fill: '#FFEFB0', text: 'Note', width: 160, height: 120 }), 'dark');
    expect(textNode(tree, 'Note')?.fill).toBe('#1A1A22');
  });

  it('falls back to theme ink for a transparent shape', () => {
    const tree = renderElement(el({ type: 'rect', fill: null, text: 'X', width: 80, height: 40 }), 'dark');
    expect(textNode(tree, 'X')?.fill).toBe('#F4F4F2');
  });

  it('honors an explicit textColor over the contrast default', () => {
    const tree = renderElement(
      el({ type: 'rect', fill: '#FFFFFF', textColor: '#FF0000', text: 'Hi', width: 100, height: 60 }),
      'dark',
    );
    expect(textNode(tree, 'Hi')?.fill).toBe('#FF0000');
  });
});

describe('renderElement font configuration', () => {
  it('threads fontFamily, bold weight, and alignment into the label', () => {
    const tree = renderElement(
      el({
        type: 'rect',
        fill: '#FFFFFF',
        text: 'Styled',
        width: 120,
        height: 60,
        fontFamily: 'Georgia, serif',
        fontWeight: 'bold',
        textAlign: 'right',
      }),
      'light',
    );
    const node = textNode(tree, 'Styled');
    expect(node?.fontFamily).toBe('Georgia, serif');
    expect(node?.fontStyle).toBe('bold');
    expect(node?.align).toBe('right');
  });

  it('combines bold + italic into a Konva "bold italic" fontStyle', () => {
    const tree = renderElement(
      el({ type: 'text', text: 'BI', width: 120, fontWeight: 'bold', italic: true }),
      'light',
    );
    expect(textNode(tree, 'BI')?.fontStyle).toBe('bold italic');
  });
});
