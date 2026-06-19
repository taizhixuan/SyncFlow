/**
 * templates.ts — pure template builders for board templates (M5-Task1).
 *
 * Each builder returns a list of CanvasElements using createElement() so that
 * default styling / dimensions stay consistent with the rest of the canvas.
 * All ids come from the caller-supplied idGen so builders are deterministic in
 * tests and produce UUID-style ids in production.
 *
 * Templates produce normal elements → they sync for free via Yjs.
 */
import type { CanvasElement } from '@syncflow/shared';
import { createElement, type ActiveStyle } from './element';
import { layoutMindMap } from './mindmap';

export type TemplateId = 'retro' | 'kanban' | 'flowchart' | 'mindmap' | 'user-story-map';

export interface BoardTemplate {
  id: TemplateId;
  name: string;
  description: string;
  build(origin: { x: number; y: number }, idGen: () => string): CanvasElement[];
}

/** Default auto-style used for all template elements so they adapt to theme. */
const AUTO_STYLE: ActiveStyle = {
  stroke: 'auto',
  fill: null,
  strokeWidth: 2,
  strokeStyle: 'solid',
  fontSize: 16,
};

// ── Retro ──────────────────────────────────────────────────────────────────────

const retroTemplate: BoardTemplate = {
  id: 'retro',
  name: 'Retrospective',
  description: 'Start / Stop / Continue — classic team retro board with three columns.',
  build(origin, idGen) {
    const FRAME_W = 400;
    const FRAME_H = 480;
    const GAP = 24;
    const labels = ['Start', 'Stop', 'Continue'] as const;
    const elements: CanvasElement[] = [];

    for (let i = 0; i < labels.length; i++) {
      const frame = createElement('frame', {
        x: origin.x + i * (FRAME_W + GAP),
        y: origin.y,
      }, -1, AUTO_STYLE);
      frame.id = idGen();
      frame.width = FRAME_W;
      frame.height = FRAME_H;
      frame.name = labels[i];
      elements.push(frame);

      // One seed sticky per column.
      const sticky = createElement('sticky', {
        x: origin.x + i * (FRAME_W + GAP) + 24,
        y: origin.y + 56,
      }, i * 2, AUTO_STYLE);
      sticky.id = idGen();
      sticky.text = `Add a "${labels[i]}" note…`;
      elements.push(sticky);
    }

    return elements;
  },
};

// ── Kanban ─────────────────────────────────────────────────────────────────────

const kanbanTemplate: BoardTemplate = {
  id: 'kanban',
  name: 'Kanban Board',
  description: 'To Do / Doing / Done — simple kanban workflow.',
  build(origin, idGen) {
    const FRAME_W = 360;
    const FRAME_H = 520;
    const GAP = 24;
    const cols = ['To Do', 'Doing', 'Done'] as const;
    const elements: CanvasElement[] = [];

    for (let i = 0; i < cols.length; i++) {
      const frame = createElement('frame', {
        x: origin.x + i * (FRAME_W + GAP),
        y: origin.y,
      }, -1, AUTO_STYLE);
      frame.id = idGen();
      frame.width = FRAME_W;
      frame.height = FRAME_H;
      frame.name = cols[i];
      elements.push(frame);

      // One seed sticky per column.
      const sticky = createElement('sticky', {
        x: origin.x + i * (FRAME_W + GAP) + 20,
        y: origin.y + 56,
      }, i * 2, AUTO_STYLE);
      sticky.id = idGen();
      sticky.text = `Add a task…`;
      elements.push(sticky);
    }

    return elements;
  },
};

// ── Flowchart ─────────────────────────────────────────────────────────────────

const flowchartTemplate: BoardTemplate = {
  id: 'flowchart',
  name: 'Flowchart Starter',
  description: 'A simple flowchart with connected decision and process shapes.',
  build(origin, idGen) {
    const elements: CanvasElement[] = [];
    const H_STEP = 200;

    // Start rect
    const start = createElement('rect', { x: origin.x, y: origin.y }, 1, AUTO_STYLE);
    start.id = idGen();
    start.width = 160;
    start.height = 60;
    start.text = 'Start';
    elements.push(start);

    // Process rect
    const process = createElement('rect', {
      x: origin.x + H_STEP,
      y: origin.y,
    }, 2, AUTO_STYLE);
    process.id = idGen();
    process.width = 160;
    process.height = 60;
    process.text = 'Process';
    elements.push(process);

    // Decision diamond
    const decision = createElement('diamond', {
      x: origin.x + H_STEP * 2,
      y: origin.y,
    }, 3, AUTO_STYLE);
    decision.id = idGen();
    decision.width = 160;
    decision.height = 80;
    decision.text = 'Decision?';
    elements.push(decision);

    // End rect
    const end = createElement('rect', {
      x: origin.x + H_STEP * 3,
      y: origin.y,
    }, 4, AUTO_STYLE);
    end.id = idGen();
    end.width = 160;
    end.height = 60;
    end.text = 'End';
    elements.push(end);

    // Connector: Start → Process
    const conn1 = createElement('connector', { x: 0, y: 0 }, 5, AUTO_STYLE);
    conn1.id = idGen();
    conn1.from = { elementId: start.id };
    conn1.to = { elementId: process.id };
    conn1.endArrow = true;
    elements.push(conn1);

    // Connector: Process → Decision
    const conn2 = createElement('connector', { x: 0, y: 0 }, 6, AUTO_STYLE);
    conn2.id = idGen();
    conn2.from = { elementId: process.id };
    conn2.to = { elementId: decision.id };
    conn2.endArrow = true;
    elements.push(conn2);

    // Connector: Decision → End (Yes)
    const conn3 = createElement('connector', { x: 0, y: 0 }, 7, AUTO_STYLE);
    conn3.id = idGen();
    conn3.from = { elementId: decision.id };
    conn3.to = { elementId: end.id };
    conn3.endArrow = true;
    conn3.label = 'Yes';
    elements.push(conn3);

    return elements;
  },
};

// ── Mind Map ──────────────────────────────────────────────────────────────────

const mindmapTemplate: BoardTemplate = {
  id: 'mindmap',
  name: 'Mind Map',
  description: 'A root topic with three branching sub-topics, laid out automatically.',
  build(origin, idGen) {
    const elements: CanvasElement[] = [];

    const root = createElement('mindnode', { x: origin.x, y: origin.y }, 1, AUTO_STYLE);
    root.id = idGen();
    root.text = 'Central Topic';

    const childLabels = ['Branch A', 'Branch B', 'Branch C'];
    const children: CanvasElement[] = childLabels.map((label, i) => {
      const child = createElement('mindnode', { x: origin.x, y: origin.y }, i + 2, AUTO_STYLE);
      child.id = idGen();
      child.text = label;
      child.parentId = root.id;
      return child;
    });

    // Use layoutMindMap to assign tidy positions.
    const allNodes = [root, ...children];
    const positions = layoutMindMap(allNodes, { hGap: 200, vGap: 80 });

    for (const node of allNodes) {
      const pos = positions[node.id];
      if (pos) {
        node.x = pos.x;
        node.y = pos.y;
      }
      elements.push(node);
    }

    return elements;
  },
};

// ── User Story Map ────────────────────────────────────────────────────────────

const userStoryMapTemplate: BoardTemplate = {
  id: 'user-story-map',
  name: 'User Story Map',
  description: 'Activities (frames) in a row with user-story sticky cards beneath each.',
  build(origin, idGen) {
    const FRAME_W = 320;
    const FRAME_H = 100;
    const STICKY_H = 120;
    const STICKY_W = 160;
    const GAP = 24;
    const STICKY_MARGIN = 16;
    const activities = ['Discovery', 'Sign Up', 'Core Flow'] as const;
    const elements: CanvasElement[] = [];

    for (let i = 0; i < activities.length; i++) {
      const frameX = origin.x + i * (FRAME_W + GAP);
      const frameY = origin.y;

      const frame = createElement('frame', { x: frameX, y: frameY }, -1, AUTO_STYLE);
      frame.id = idGen();
      frame.width = FRAME_W;
      frame.height = FRAME_H;
      frame.name = activities[i];
      elements.push(frame);

      // Two story stickies per activity column.
      for (let j = 0; j < 2; j++) {
        const sticky = createElement('sticky', {
          x: frameX + j * (STICKY_W + STICKY_MARGIN),
          y: frameY + FRAME_H + GAP,
        }, i * 4 + j + 1, AUTO_STYLE);
        sticky.id = idGen();
        sticky.width = STICKY_W;
        sticky.height = STICKY_H;
        sticky.text = `Story ${j + 1}`;
        elements.push(sticky);
      }
    }

    return elements;
  },
};

// ── Export ────────────────────────────────────────────────────────────────────

export const ALL_TEMPLATES: BoardTemplate[] = [
  retroTemplate,
  kanbanTemplate,
  flowchartTemplate,
  mindmapTemplate,
  userStoryMapTemplate,
];
