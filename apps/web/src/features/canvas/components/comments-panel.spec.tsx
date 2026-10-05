import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createCanvasStore, type CanvasStore } from '../engine/canvas-store';
import { CommentsPanel } from './comments-panel';

const ME = { id: 'u1', name: 'Pat' };

function setup(draftElementId: string | null = 'el-1'): { store: CanvasStore; onDraftDone: ReturnType<typeof vi.fn> } {
  const store = createCanvasStore('comments-spec');
  const onDraftDone = vi.fn();
  render(
    <CommentsPanel
      store={store}
      open
      onClose={() => {}}
      currentUser={ME}
      draftElementId={draftElementId}
      onDraftDone={onDraftDone}
    />,
  );
  return { store, onDraftDone };
}

describe('CommentsPanel new-comment draft', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('opens a focused composer for the first message, without creating an empty comment', () => {
    // "Add comment" used to write an empty thread to the doc (synced to every
    // peer) and offer only a "Reply" box, so the first message could never be written.
    const { store } = setup();
    const box = screen.getByRole('textbox', { name: 'New comment' });
    expect(box).toHaveFocus();
    expect(store.getState().comments).toHaveLength(0);
    expect(screen.queryByText(/no comments yet/i)).toBeNull();
  });

  it('creates the thread with the typed body on submit and opens it', () => {
    const { store, onDraftDone } = setup();
    fireEvent.change(screen.getByRole('textbox', { name: 'New comment' }), {
      target: { value: '  Ship it?  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Comment' }));
    const [comment] = store.getState().comments;
    expect(comment).toMatchObject({ elementId: 'el-1', body: 'Ship it?', authorId: 'u1' });
    expect(store.getState().openCommentId).toBe(comment!.id);
    expect(onDraftDone).toHaveBeenCalledOnce();
  });

  it('cancelling the draft writes nothing', () => {
    const { store, onDraftDone } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(store.getState().comments).toHaveLength(0);
    expect(onDraftDone).toHaveBeenCalledOnce();
  });

  it("can't post a blank comment", () => {
    setup();
    expect(screen.getByRole('button', { name: 'Comment' })).toBeDisabled();
  });

  it('shows no composer without a draft', () => {
    setup(null);
    expect(screen.queryByRole('textbox', { name: 'New comment' })).toBeNull();
  });
});
