import type { Meta, StoryObj } from '@storybook/react-vite';
import { createCanvasStore } from '@/features/canvas/engine/canvas-store';
import { ToolRail } from './tool-rail';

const store = createCanvasStore('storybook-tool-rail');

const meta: Meta<typeof ToolRail> = {
  title: 'Canvas/ToolRail',
  component: ToolRail,
  parameters: { layout: 'centered' },
  args: { store },
  argTypes: { store: { control: false, table: { disable: true } } },
  decorators: [
    (Story) => (
      <div style={{ position: 'relative', width: 120, height: 460 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
