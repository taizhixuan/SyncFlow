/**
 * TDD spec for the markdown block parser.
 * Written BEFORE the implementation — these tests must fail first, then pass.
 */
import { describe, expect, it } from 'vitest';
import { parseMarkdownBlocks } from './markdown';
import type { MdBlock } from './markdown';

describe('parseMarkdownBlocks', () => {
  it('parses a level-1 heading', () => {
    const blocks = parseMarkdownBlocks('# Hello world');
    expect(blocks).toHaveLength(1);
    const b = blocks[0] as Extract<MdBlock, { kind: 'heading' }>;
    expect(b.kind).toBe('heading');
    expect(b.level).toBe(1);
    expect(b.text).toBe('Hello world');
  });

  it('parses level-2 and level-3 headings', () => {
    const blocks = parseMarkdownBlocks('## Section\n### Subsection');
    expect(blocks[0]).toMatchObject({ kind: 'heading', level: 2, text: 'Section' });
    expect(blocks[1]).toMatchObject({ kind: 'heading', level: 3, text: 'Subsection' });
  });

  it('parses an unordered list item with dash prefix', () => {
    const blocks = parseMarkdownBlocks('- item one');
    expect(blocks[0]).toMatchObject({ kind: 'list-item', ordered: false, text: 'item one' });
  });

  it('parses an unordered list item with star prefix', () => {
    const blocks = parseMarkdownBlocks('* item two');
    expect(blocks[0]).toMatchObject({ kind: 'list-item', ordered: false, text: 'item two' });
  });

  it('parses an ordered list item', () => {
    const blocks = parseMarkdownBlocks('1. first item');
    expect(blocks[0]).toMatchObject({ kind: 'list-item', ordered: true, index: 1, text: 'first item' });
  });

  it('parses ordered items with different numbers', () => {
    const blocks = parseMarkdownBlocks('3. third');
    const b = blocks[0] as Extract<MdBlock, { kind: 'list-item' }>;
    expect(b.ordered).toBe(true);
    expect(b.index).toBe(3);
    expect(b.text).toBe('third');
  });

  it('detects a link on a line (exposes label and url)', () => {
    const blocks = parseMarkdownBlocks('[click here](https://example.com)');
    const b = blocks[0] as Extract<MdBlock, { kind: 'paragraph' }>;
    expect(b.kind).toBe('paragraph');
    expect(b.link).toMatchObject({ label: 'click here', url: 'https://example.com' });
  });

  it('detects bold emphasis on a line', () => {
    const blocks = parseMarkdownBlocks('**bold text**');
    const b = blocks[0] as Extract<MdBlock, { kind: 'paragraph' }>;
    expect(b.bold).toBe(true);
    expect(b.text).toBe('bold text');
  });

  it('detects italic emphasis on a line', () => {
    const blocks = parseMarkdownBlocks('*italic text*');
    const b = blocks[0] as Extract<MdBlock, { kind: 'paragraph' }>;
    expect(b.italic).toBe(true);
    expect(b.text).toBe('italic text');
  });

  it('falls through to a plain paragraph for unrecognised lines', () => {
    const blocks = parseMarkdownBlocks('Just a normal paragraph.');
    expect(blocks[0]).toMatchObject({ kind: 'paragraph', text: 'Just a normal paragraph.' });
  });

  it('parses multiple mixed blocks', () => {
    const src = '# Title\n- bullet\n1. numbered\nplain';
    const blocks = parseMarkdownBlocks(src);
    expect(blocks).toHaveLength(4);
    expect(blocks[0]).toMatchObject({ kind: 'heading', level: 1, text: 'Title' });
    expect(blocks[1]).toMatchObject({ kind: 'list-item', ordered: false, text: 'bullet' });
    expect(blocks[2]).toMatchObject({ kind: 'list-item', ordered: true, index: 1, text: 'numbered' });
    expect(blocks[3]).toMatchObject({ kind: 'paragraph', text: 'plain' });
  });

  it('skips blank lines', () => {
    const blocks = parseMarkdownBlocks('# A\n\nplain');
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ kind: 'heading', level: 1 });
    expect(blocks[1]).toMatchObject({ kind: 'paragraph', text: 'plain' });
  });

  it('returns empty array for empty string', () => {
    expect(parseMarkdownBlocks('')).toEqual([]);
  });

  it('does not mark plain paragraph as bold or italic', () => {
    const blocks = parseMarkdownBlocks('hello');
    const b = blocks[0] as Extract<MdBlock, { kind: 'paragraph' }>;
    expect(b.bold).toBeFalsy();
    expect(b.italic).toBeFalsy();
    expect(b.link).toBeUndefined();
  });
});
