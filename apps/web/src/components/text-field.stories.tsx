import type { Meta, StoryObj } from '@storybook/react-vite';
import { TextField } from './text-field';

const meta: Meta<typeof TextField> = {
  title: 'Components/TextField',
  component: TextField,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div style={{ width: 320 }}>
        <Story />
      </div>
    ),
  ],
  args: { label: 'Email', name: 'email', placeholder: 'you@example.com' },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithValue: Story = { args: { defaultValue: 'taizhixuan@gmail.com' } };

export const WithError: Story = {
  args: { defaultValue: 'taken@example.com', error: 'That email is already registered.' },
};

export const Password: Story = {
  args: { label: 'Password', name: 'password', type: 'password', defaultValue: 'hunter2hunter2' },
};

export const Disabled: Story = { args: { disabled: true, defaultValue: 'locked@example.com' } };
