import { describe, expect, it } from 'vitest';
import type { CanvasElement } from '@syncflow/shared';
import { ALL_TEMPLATES, type TemplateId } from './templates';

// Deterministic id generator for tests.
function makeIdGen(): () => string {
  let n = 0;
  return () => `id-${++n}`;
}

const ORIGIN = { x: 0, y: 0 };

function buildTemplate(id: TemplateId): CanvasElement[] {
  const tmpl = ALL_TEMPLATES.find((t) => t.id === id);
  if (!tmpl) throw new Error(`Template "${id}" not found`);
  return tmpl.build(ORIGIN, makeIdGen());
}

describe('retro template', () => {
  it('produces 3 frames', () => {
    const els = buildTemplate('retro');
    const frames = els.filter((e) => e.type === 'frame');
    expect(frames).toHaveLength(3);
  });

  it('names the frames Start, Stop, Continue', () => {
    const els = buildTemplate('retro');
    const names = els.filter((e) => e.type === 'frame').map((e) => e.name);
    expect(names).toContain('Start');
    expect(names).toContain('Stop');
    expect(names).toContain('Continue');
  });

  it('includes seed stickies', () => {
    const els = buildTemplate('retro');
    const stickies = els.filter((e) => e.type === 'sticky');
    expect(stickies.length).toBeGreaterThanOrEqual(1);
  });

  it('all element ids are unique', () => {
    const els = buildTemplate('retro');
    const ids = els.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('positions are relative to origin', () => {
    const origin = { x: 100, y: 200 };
    const tmpl = ALL_TEMPLATES.find((t) => t.id === 'retro')!;
    const els = tmpl.build(origin, makeIdGen());
    const frames = els.filter((e) => e.type === 'frame');
    // All frames should start at or after origin.x
    for (const f of frames) expect(f.x).toBeGreaterThanOrEqual(origin.x);
  });
});

describe('kanban template', () => {
  it('produces 3 frames', () => {
    const els = buildTemplate('kanban');
    expect(els.filter((e) => e.type === 'frame')).toHaveLength(3);
  });

  it('names the frames To Do, Doing, Done', () => {
    const names = buildTemplate('kanban')
      .filter((e) => e.type === 'frame')
      .map((e) => e.name);
    expect(names).toContain('To Do');
    expect(names).toContain('Doing');
    expect(names).toContain('Done');
  });

  it('includes seed stickies', () => {
    const els = buildTemplate('kanban');
    expect(els.filter((e) => e.type === 'sticky').length).toBeGreaterThanOrEqual(1);
  });
});

describe('flowchart template', () => {
  it('has shapes (rect or diamond) and connector elements', () => {
    const els = buildTemplate('flowchart');
    const shapes = els.filter((e) => e.type === 'rect' || e.type === 'diamond');
    const connectors = els.filter((e) => e.type === 'connector');
    expect(shapes.length).toBeGreaterThanOrEqual(2);
    expect(connectors.length).toBeGreaterThanOrEqual(1);
  });

  it('connector from/to elementIds reference real created element ids', () => {
    const els = buildTemplate('flowchart');
    const ids = new Set(els.map((e) => e.id));
    const connectors = els.filter((e) => e.type === 'connector');
    for (const c of connectors) {
      if (c.from?.elementId) expect(ids.has(c.from.elementId)).toBe(true);
      if (c.to?.elementId) expect(ids.has(c.to.elementId)).toBe(true);
    }
  });

  it('connectors have non-null from/to bindings', () => {
    const connectors = buildTemplate('flowchart').filter((e) => e.type === 'connector');
    for (const c of connectors) {
      expect(c.from).toBeDefined();
      expect(c.to).toBeDefined();
    }
  });
});

describe('mindmap template', () => {
  it('has a root mindnode and at least 3 child mindnodes', () => {
    const els = buildTemplate('mindmap');
    const nodes = els.filter((e) => e.type === 'mindnode');
    expect(nodes.length).toBeGreaterThanOrEqual(4); // 1 root + 3 children
  });

  it('child mindnodes have parentId equal to the root id', () => {
    const els = buildTemplate('mindmap');
    const nodes = els.filter((e) => e.type === 'mindnode');
    const root = nodes.find((n) => !n.parentId);
    expect(root).toBeDefined();
    const children = nodes.filter((n) => n.parentId);
    expect(children.length).toBeGreaterThanOrEqual(3);
    for (const child of children) {
      expect(child.parentId).toBe(root!.id);
    }
  });

  it('positions are assigned by layoutMindMap (children x > root x)', () => {
    const els = buildTemplate('mindmap');
    const nodes = els.filter((e) => e.type === 'mindnode');
    const root = nodes.find((n) => !n.parentId)!;
    const children = nodes.filter((n) => n.parentId);
    for (const child of children) {
      expect(child.x).toBeGreaterThan(root.x);
    }
  });
});

describe('user-story-map template', () => {
  it('has a row of activity frames', () => {
    const els = buildTemplate('user-story-map');
    const frames = els.filter((e) => e.type === 'frame');
    expect(frames.length).toBeGreaterThanOrEqual(2);
  });

  it('has sticky cards beneath the frames', () => {
    const els = buildTemplate('user-story-map');
    const stickies = els.filter((e) => e.type === 'sticky');
    expect(stickies.length).toBeGreaterThanOrEqual(2);
  });

  it('stickies are positioned below frames (y > frame.y)', () => {
    const els = buildTemplate('user-story-map');
    const frames = els.filter((e) => e.type === 'frame');
    const stickies = els.filter((e) => e.type === 'sticky');
    const minFrameY = Math.min(...frames.map((f) => f.y));
    const frameHeight = frames[0]?.height ?? 0;
    for (const s of stickies) {
      expect(s.y).toBeGreaterThanOrEqual(minFrameY + frameHeight);
    }
  });
});

describe('ALL_TEMPLATES metadata', () => {
  it('exports exactly 5 templates', () => {
    expect(ALL_TEMPLATES).toHaveLength(5);
  });

  it('each template has id, name, description, and build function', () => {
    for (const t of ALL_TEMPLATES) {
      expect(typeof t.id).toBe('string');
      expect(typeof t.name).toBe('string');
      expect(typeof t.description).toBe('string');
      expect(typeof t.build).toBe('function');
    }
  });
});
