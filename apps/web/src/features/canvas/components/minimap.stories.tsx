import type { Meta, StoryObj } from '@storybook/react-vite';
import { createCanvasStore } from '@/features/canvas/engine/canvas-store';
import { Minimap } from './minimap';

const store = createCanvasStore('storybook-minimap');

const meta: Meta<typeof Minimap> = {
  title: 'Canvas/Minimap',
  component: Minimap,
  parameters: { layout: 'centered' },
  args: { store, stageSize: { width: 1200, height: 800 } },
  argTypes: { store: { control: false, table: { disable: true } } },
  decorators: [
    (Story) => (
      <div style={{ position: 'relative', width: 320, height: 240 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
