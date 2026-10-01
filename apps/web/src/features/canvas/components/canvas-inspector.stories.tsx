import type { Meta, StoryObj } from '@storybook/react-vite';
import { AuthProvider } from '@/features/auth/auth-context';
import { createCanvasStore } from '../engine/canvas-store';
import { addElements } from '../model/commands';
import { createElement } from '../model/element';
import { CanvasInspector } from './canvas-inspector';

const empty = createCanvasStore('storybook-inspector-empty');

const withSelection = createCanvasStore('storybook-inspector-selection');
const sticky = {
  ...createElement('sticky', { x: 872, y: 56 }, 0, withSelection.getState().activeStyle),
  text: 'Offline-first sync',
  fill: '#E6E0FF',
};
withSelection.getState().dispatch(addElements([sticky]));
withSelection.getState().setSelected([sticky.id]);

const meta: Meta<typeof CanvasInspector> = {
  title: 'Canvas/CanvasInspector',
  component: CanvasInspector,
  // The inspector docks to the right edge from lg up; view it full-width.
  parameters: { layout: 'fullscreen', viewport: { defaultViewport: 'responsive' } },
  args: { store: empty, onOpenComments: () => {}, onOpenHistory: () => {}, onHide: () => {} },
  argTypes: { store: { control: false, table: { disable: true } } },
  decorators: [
    (Story) => (
      <AuthProvider>
        <div style={{ height: '100vh' }}>
          <Story />
        </div>
      </AuthProvider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof meta>;

/** Nothing selected: the controls set the style of the next shape. */
export const NextShape: Story = {};

/** One sticky note selected: its style, exact geometry, arrange and tags. */
export const StickySelected: Story = { args: { store: withSelection } };
