import type { Meta, StoryObj } from '@storybook/react-vite';
import { CursorFlag } from './cursor-flag';

const meta: Meta<typeof CursorFlag> = {
  title: 'Components/CursorFlag',
  component: CursorFlag,
  tags: ['autodocs'],
  // CursorFlag is absolutely positioned; give it a relative stage to sit in.
  decorators: [
    (Story) => (
      <div style={{ position: 'relative', width: 260, height: 90 }}>
        <Story />
      </div>
    ),
  ],
  args: { name: 'Tai', color: '#3B5BFF' },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Violet: Story = { args: { name: 'Mira', color: '#9B5BFF' } };

export const Amber: Story = { args: { name: 'Jordan', color: '#F59E0B' } };

export const LongName: Story = { args: { name: 'Alexandra Whitfield', color: '#10B981' } };
