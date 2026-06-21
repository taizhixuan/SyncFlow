import type { Meta, StoryObj } from '@storybook/react-vite';
import { createCanvasStore } from '@/features/canvas/engine/canvas-store';
import { BoardTimer } from './board-timer';

const store = createCanvasStore('storybook-board-timer');

const meta = {
  title: 'Canvas/BoardTimer',
  component: BoardTimer,
  parameters: { layout: 'centered' },
  args: { store },
  argTypes: { store: { control: false, table: { disable: true } } },
} satisfies Meta<typeof BoardTimer>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
