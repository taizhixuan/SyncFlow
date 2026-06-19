import { describe, expect, it } from 'vitest';
import type { CanvasElement } from '@syncflow/shared';
import { elementsToSvg } from './export-svg';

function makeEl(overrides: Partial<CanvasElement>): CanvasElement {
  return {
    id: 'el-1',
    type: 'rect',
    x: 0,
    y: 0,
    rotation: 0,
    opacity: 1,
    zIndex: 0,
    fill: '#FFFFFF',
    stroke: '#000000',
    strokeWidth: 1,
    strokeStyle: 'solid',
    width: 100,
    height: 100,
    ...overrides,
  } as CanvasElement;
}

describe('elementsToSvg', () => {
  it('empty array → valid SVG string', () => {
    const svg = elementsToSvg([], 'light');
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it('single rect → contains <rect with correct dimensions and group translate', () => {
    const el = makeEl({ type: 'rect', x: 10, y: 20, width: 100, height: 50, fill: '#FF0000', stroke: '#000000' });
    const svg = elementsToSvg([el], 'light');
    expect(svg).toContain('<rect');
    // Position is encoded in the group translate, not on <rect> itself
    expect(svg).toContain('translate(10,20)');
    expect(svg).toContain('width="100"');
    expect(svg).toContain('height="50"');
    expect(svg).toContain('fill="#FF0000"');
  });

  it('single ellipse → contains <ellipse', () => {
    const el = makeEl({ type: 'ellipse', x: 0, y: 0, width: 80, height: 60 });
    const svg = elementsToSvg([el], 'light');
    expect(svg).toContain('<ellipse');
  });

  it('single text element → contains <text', () => {
    const el = makeEl({ type: 'text', x: 5, y: 5, width: 200, height: 30, text: 'Hello', fontSize: 16 });
    const svg = elementsToSvg([el], 'light');
    expect(svg).toContain('<text');
  });

  it('single mindnode → contains <rect (rendered as rounded rect)', () => {
    const el = makeEl({ type: 'mindnode', x: 0, y: 0, width: 140, height: 44, text: 'Idea' });
    const svg = elementsToSvg([el], 'light');
    expect(svg).toContain('<rect');
  });

  it('single frame element → contains <rect', () => {
    const el = makeEl({ type: 'frame', x: 0, y: 0, width: 480, height: 320, name: 'Frame 1', stroke: 'auto' });
    const svg = elementsToSvg([el], 'light');
    expect(svg).toContain('<rect');
  });

  it('single connector element → contains <line', () => {
    const el = makeEl({
      id: 'conn-1',
      type: 'connector',
      x: 0,
      y: 0,
      width: undefined,
      height: undefined,
      from: { x: 10, y: 10 },
      to: { x: 100, y: 100 },
    });
    const svg = elementsToSvg([el], 'light');
    expect(svg).toContain('<line');
  });
});
