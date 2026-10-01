import type { Meta, StoryObj } from '@storybook/react-vite';
import { Grid2x2, History, MessageSquare, Pencil, Square, StickyNote, SunMoon } from 'lucide-react';
import { CommandPalette, type Command } from './command-palette';

const noop = (): void => {};
const commands: Command[] = [
  { id: 'rect', group: 'Tools', label: 'Rectangle', Icon: Square, shortcut: 'R', run: noop },
  { id: 'pen', group: 'Tools', label: 'Pen', Icon: Pencil, shortcut: 'P', run: noop },
  { id: 'sticky', group: 'Tools', label: 'Sticky note', Icon: StickyNote, shortcut: 'S', run: noop },
  { id: 'comments', group: 'Panels', label: 'Comments', Icon: MessageSquare, run: noop },
  { id: 'history', group: 'Panels', label: 'Version history', Icon: History, run: noop },
  { id: 'theme', group: 'View', label: 'Toggle light / dark theme', Icon: SunMoon, keywords: 'dark mode', run: noop },
  { id: 'grid', group: 'View', label: 'Toggle grid', Icon: Grid2x2, run: noop },
];

const meta: Meta<typeof CommandPalette> = {
  title: 'Canvas/CommandPalette',
  component: CommandPalette,
  parameters: { layout: 'fullscreen' },
  args: { open: true, onClose: noop, commands },
  argTypes: { commands: { control: false } },
};

export default meta;

type Story = StoryObj<typeof meta>;

/** Opened with Ctrl/⌘+K; type to filter, arrows to move, Enter to run. */
export const Open: Story = {};
