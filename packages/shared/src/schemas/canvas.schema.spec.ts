import { describe, expect, it } from 'vitest';
import { canvasElementSchema, ELEMENT_TYPES } from './canvas.schema';

describe('canvasElementSchema', () => {
  it('includes the new element types', () => {
    expect(ELEMENT_TYPES).toEqual(
      expect.arrayContaining(['connector', 'frame', 'image', 'code', 'mindnode', 'diamond']),
    );
  });

  it("accepts 'auto' as a stroke color", () => {
    const el = canvasElementSchema.parse({ id: 'a', type: 'rect', x: 0, y: 0, stroke: 'auto' });
    expect(el.stroke).toBe('auto');
  });

  it('accepts new style fields and defaults strokeStyle to solid', () => {
    const el = canvasElementSchema.parse({
      id: 'a',
      type: 'rect',
      x: 0,
      y: 0,
      cornerRadius: 8,
      sketch: true,
      locked: true,
    });
    expect(el.strokeStyle).toBe('solid');
    expect(el.sketch).toBe(true);
    expect(el.locked).toBe(true);
  });

  it('accepts markdown:true on a text element (backward-compatible)', () => {
    const el = canvasElementSchema.parse({
      id: 'b',
      type: 'text',
      x: 0,
      y: 0,
      text: '# Hello',
      markdown: true,
    });
    expect(el.markdown).toBe(true);
  });

  it('leaves markdown undefined when not provided (backward-compatible)', () => {
    const el = canvasElementSchema.parse({ id: 'c', type: 'text', x: 0, y: 0 });
    expect(el.markdown).toBeUndefined();
  });

  it('accepts votes and reactions fields (M4 dot-voting)', () => {
    const el = canvasElementSchema.parse({
      id: 'd',
      type: 'rect',
      x: 0,
      y: 0,
      votes: { u1: 2, u2: 1 },
      reactions: { '👍': ['u1', 'u2'], '❤️': ['u3'] },
    });
    expect(el.votes).toEqual({ u1: 2, u2: 1 });
    expect(el.reactions).toEqual({ '👍': ['u1', 'u2'], '❤️': ['u3'] });
  });

  it('leaves votes and reactions undefined when not provided (backward-compatible)', () => {
    const el = canvasElementSchema.parse({ id: 'e', type: 'rect', x: 0, y: 0 });
    expect(el.votes).toBeUndefined();
    expect(el.reactions).toBeUndefined();
  });
});
