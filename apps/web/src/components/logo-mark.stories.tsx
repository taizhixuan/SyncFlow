import type { Meta, StoryObj } from '@storybook/react-vite';
import { LogoMark } from './logo-mark';

const meta = {
  title: 'Components/LogoMark',
  component: LogoMark,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: { size: 28 },
  argTypes: {
    size: { control: { type: 'range', min: 16, max: 160, step: 4 } },
  },
} satisfies Meta<typeof LogoMark>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Favicon: Story = { args: { size: 16 } };

export const Large: Story = { args: { size: 96 } };
