import { describe, expect, it } from 'vitest';
import type { CanvasElement, Comment } from '@syncflow/shared';
import { pinPosition } from './comments-layer';
import { badgeAnchor } from './vote-overlay';

describe('element badges', () => {
  it("keeps the vote badge and the comment pin on different corners so neither hides the other", () => {
    const el = { id: 'a', type: 'rect', x: 100, y: 50, width: 200, height: 120, rotation: 0 } as CanvasElement;
    const comment = { id: 'c', elementId: 'a' } as Comment;
    expect(badgeAnchor(el)).not.toEqual(pinPosition(comment, { a: el }));
  });
});
