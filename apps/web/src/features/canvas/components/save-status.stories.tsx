import type { Meta, StoryObj } from '@storybook/react-vite';
import { createCanvasStore } from '@/features/canvas/engine/canvas-store';
import { SaveStatus } from './save-status';

const store = createCanvasStore('storybook-save-status');

const meta = {
  title: 'Canvas/SaveStatus',
  component: SaveStatus,
  parameters: { layout: 'centered' },
  args: { store, connection: 'live' },
  argTypes: {
    store: { control: false, table: { disable: true } },
    connection: { control: 'inline-radio', options: ['offline', 'connecting', 'live'] },
  },
} satisfies Meta<typeof SaveStatus>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Live: Story = {};

export const Connecting: Story = { args: { connection: 'connecting' } };

export const Offline: Story = { args: { connection: 'offline', isLocal: true } };
