import type { Meta, StoryObj } from '@storybook/react-vite';
import { createCanvasStore } from '@/features/canvas/engine/canvas-store';
import { ZoomBar } from './zoom-bar';

const store = createCanvasStore('storybook-zoom-bar');

const meta: Meta<typeof ZoomBar> = {
  title: 'Canvas/ZoomBar',
  component: ZoomBar,
  parameters: { layout: 'centered' },
  args: { store, size: { width: 1200, height: 800 } },
  argTypes: { store: { control: false, table: { disable: true } } },
  decorators: [
    (Story) => (
      <div style={{ position: 'relative', width: 480, height: 120 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
