import type { Meta, StoryObj } from '@storybook/react-vite';
import { createCanvasStore } from '../engine/canvas-store';
import { CanvasStatusBar } from './canvas-status-bar';

const store = createCanvasStore('storybook-status-bar');

const meta: Meta<typeof CanvasStatusBar> = {
  title: 'Canvas/CanvasStatusBar',
  component: CanvasStatusBar,
  parameters: { layout: 'fullscreen' },
  args: {
    store,
    stageSize: { width: 1200, height: 800 },
    connection: 'live',
    isLocal: true,
    minimapOpen: true,
    onToggleMinimap: () => {},
  },
  argTypes: { store: { control: false, table: { disable: true } } },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
