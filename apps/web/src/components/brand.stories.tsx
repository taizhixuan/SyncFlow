import type { Meta, StoryObj } from '@storybook/react-vite';
import { Brand } from './brand';

const meta = {
  title: 'Components/Brand',
  component: Brand,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Brand>;

export default meta;

type Story = StoryObj<typeof meta>;

// Renders the logo mark + wordmark as a link home (router provided globally).
export const Default: Story = {};
