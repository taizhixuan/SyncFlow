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

describe('elementsToSvg — hostile element data', () => {
  const hostile = 'x" onload="alert(1)';

  function noInjection(svg: string): void {
    expect(svg).not.toMatch(/onload=/i);
    expect(svg).not.toMatch(/<script/i);
    expect(svg).not.toMatch(/javascript:/i);
  }

  it('drops a stroke/fill that is not a color', () => {
    const svg = elementsToSvg([makeEl({ stroke: hostile, fill: hostile })], 'light');
    noInjection(svg);
    expect(svg).toContain('stroke="#1A1A22"'); // falls back to theme ink
  });

  it('keeps legitimate colors', () => {
    const svg = elementsToSvg([makeEl({ stroke: 'rgba(0,0,0,0.5)', fill: 'tomato' })], 'light');
    expect(svg).toContain('stroke="rgba(0,0,0,0.5)"');
    expect(svg).toContain('fill="tomato"');
  });

  it('escapes the element id', () => {
    const svg = elementsToSvg([makeEl({ id: '"><script>alert(1)</script>' })], 'light');
    noInjection(svg);
    expect(svg).toContain('&quot;&gt;&lt;script&gt;');
  });

  it('refuses javascript: and markup-bearing image urls', () => {
    for (const assetUrl of ['javascript:alert(1)', '"><script>alert(1)</script>', 'data:text/html,<script>alert(1)</script>']) {
      const svg = elementsToSvg([makeEl({ type: 'image', assetUrl })], 'light');
      noInjection(svg);
      expect(svg).not.toContain('<image');
    }
  });

  it('keeps https and raster data image urls', () => {
    const https = elementsToSvg([makeEl({ type: 'image', assetUrl: 'https://cdn.example.com/a.png?x=1&y=2' })], 'light');
    expect(https).toContain('href="https://cdn.example.com/a.png?x=1&amp;y=2"');
    const data = elementsToSvg([makeEl({ type: 'image', assetUrl: 'data:image/png;base64,iVBORw0KGgo=' })], 'light');
    expect(data).toContain('href="data:image/png;base64,iVBORw0KGgo="');
  });

  it('never lets element data close an XML comment', () => {
    const svg = elementsToSvg([makeEl({ type: '--><script>alert(1)</script><!--' as CanvasElement['type'] })], 'light');
    noInjection(svg);
    expect(svg.match(/-->/g)?.length ?? 0).toBe(svg.match(/<!--/g)?.length ?? 0);
  });

  it('honours textColor for text-bearing elements', () => {
    const svg = elementsToSvg([makeEl({ type: 'sticky', text: 'hi', textColor: '#123456' })], 'light');
    expect(svg).toContain('fill="#123456"');
  });

  it('rotates about (x, y) like the Konva group, not the center', () => {
    const svg = elementsToSvg([makeEl({ x: 10, y: 20, width: 100, height: 50, rotation: 30 })], 'light');
    expect(svg).toContain('transform="translate(10,20) rotate(30)"');
  });

  it('orders equal zIndex deterministically by id', () => {
    const a = makeEl({ id: 'b-el', zIndex: 3 });
    const b = makeEl({ id: 'a-el', zIndex: 3 });
    const svg1 = elementsToSvg([a, b], 'light');
    const svg2 = elementsToSvg([b, a], 'light');
    expect(svg1).toBe(svg2);
    expect(svg1.indexOf('id="a-el"')).toBeLessThan(svg1.indexOf('id="b-el"'));
  });
});
