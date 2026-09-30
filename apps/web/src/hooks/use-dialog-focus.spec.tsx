import { describe, expect, it, vi } from 'vitest';
import { useRef, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useDialogFocus } from './use-dialog-focus';

function Dialog({ onClose, trap }: { onClose: () => void; trap: boolean }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(ref, { onClose, trap });
  return (
    <div ref={ref} role="dialog" aria-label="Test dialog">
      <button>first</button>
      <button>last</button>
    </div>
  );
}

function Harness({ onClose = vi.fn(), trap = true }: { onClose?: () => void; trap?: boolean }): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>opener</button>
      <button onClick={() => setOpen(false)}>outside</button>
      {open && (
        <Dialog
          trap={trap}
          onClose={() => {
            onClose();
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

describe('useDialogFocus', () => {
  it('moves focus into the dialog when it opens', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByText('opener'));
    expect(screen.getByText('first')).toHaveFocus();
  });

  it('closes on Escape and returns focus to the opener', async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    await userEvent.click(screen.getByText('opener'));
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.getByText('opener')).toHaveFocus();
  });

  it('traps Tab inside a modal dialog', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByText('opener'));
    await userEvent.tab();
    expect(screen.getByText('last')).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByText('first')).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(screen.getByText('last')).toHaveFocus();
  });

  it('lets Tab leave a non-modal panel', async () => {
    render(<Harness trap={false} />);
    await userEvent.click(screen.getByText('opener'));
    await userEvent.tab();
    await userEvent.tab();
    expect(screen.getByRole('dialog')).not.toContainElement(document.activeElement as HTMLElement);
  });
});
