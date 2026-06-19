import { describe, expect, it } from 'vitest';
import type { CanvasElement } from '@syncflow/shared';
import { addElements, emptyDoc } from '../model/commands';
import { History } from './history';

const rect = (id: string): CanvasElement =>
  ({
    id,
    type: 'rect',
    x: 0,
    y: 0,
    rotation: 0,
    opacity: 1,
    zIndex: 0,
    fill: null,
    stroke: 'auto',
    strokeWidth: 2,
  }) as CanvasElement;

describe('History', () => {
  it('undo reverses a pushed command and redo re-applies it', () => {
    const h = new History();
    let doc = emptyDoc();
    doc = h.push(doc, addElements([rect('a')]));
    expect(Object.keys(doc.elements)).toEqual(['a']);
    doc = h.undo(doc);
    expect(Object.keys(doc.elements)).toEqual([]);
    expect(h.canRedo()).toBe(true);
    doc = h.redo(doc);
    expect(Object.keys(doc.elements)).toEqual(['a']);
  });
  it('a new push clears the redo stack', () => {
    const h = new History();
    let doc = h.push(emptyDoc(), addElements([rect('a')]));
    doc = h.undo(doc);
    doc = h.push(doc, addElements([rect('b')]));
    expect(h.canRedo()).toBe(false);
    expect(Object.keys(doc.elements)).toEqual(['b']);
  });
});
