import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Grid2x2, Square, SunMoon } from 'lucide-react';
import { CommandPalette, filterCommands, useCommandPaletteHotkey, type Command } from './command-palette';

function commands(run = vi.fn()): Command[] {
  return [
    { id: 'rect', group: 'Tools', label: 'Rectangle', Icon: Square, shortcut: 'R', run },
    { id: 'grid', group: 'View', label: 'Toggle grid', Icon: Grid2x2, run },
    { id: 'theme', group: 'View', label: 'Toggle light / dark theme', Icon: SunMoon, keywords: 'dark mode', run },
  ];
}

describe('filterCommands', () => {
  it('returns everything for an empty query', () => {
    expect(filterCommands(commands(), '  ')).toHaveLength(3);
  });

  it('matches every term, in any order, across label, group and keywords', () => {
    expect(filterCommands(commands(), 'grid toggle').map((c) => c.id)).toEqual(['grid']);
    expect(filterCommands(commands(), 'MODE').map((c) => c.id)).toEqual(['theme']);
    expect(filterCommands(commands(), 'tools').map((c) => c.id)).toEqual(['rect']);
    expect(filterCommands(commands(), 'nothing like this')).toEqual([]);
  });
});

describe('CommandPalette', () => {
  afterEach(() => cleanup());

  it('runs the highlighted command on Enter and closes', async () => {
    const run = vi.fn();
    const onClose = vi.fn();
    render(<CommandPalette open onClose={onClose} commands={commands(run)} />);
    const input = screen.getByRole('combobox', { name: /search commands/i });
    await userEvent.type(input, 'toggle');
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(onClose).toHaveBeenCalled();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('says so when nothing matches', async () => {
    render(<CommandPalette open onClose={() => {}} commands={commands()} />);
    await userEvent.type(screen.getByRole('combobox'), 'zzz');
    expect(screen.getByText(/no commands match/i)).toBeInTheDocument();
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    render(<CommandPalette open onClose={onClose} commands={commands()} />);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('renders nothing while closed', () => {
    render(<CommandPalette open={false} onClose={() => {}} commands={commands()} />);
    expect(screen.queryByRole('dialog', { name: /command palette/i })).toBeNull();
  });
});

describe('useCommandPaletteHotkey', () => {
  afterEach(() => cleanup());

  function Harness({ onOpen }: { onOpen: () => void }): null {
    useCommandPaletteHotkey(onOpen);
    return null;
  }

  it('opens on Ctrl+K and Cmd+K, but not on a bare K (the code-block tool)', async () => {
    const onOpen = vi.fn();
    render(<Harness onOpen={onOpen} />);
    await userEvent.keyboard('k');
    expect(onOpen).not.toHaveBeenCalled();
    await userEvent.keyboard('{Control>}k{/Control}');
    await userEvent.keyboard('{Meta>}k{/Meta}');
    expect(onOpen).toHaveBeenCalledTimes(2);
  });
});
