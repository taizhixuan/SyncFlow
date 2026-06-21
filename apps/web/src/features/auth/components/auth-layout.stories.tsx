import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { AuthLayout } from './auth-layout';

const meta = {
  title: 'Auth/AuthLayout',
  component: AuthLayout,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  args: {
    title: 'Welcome back',
    subtitle: 'Sign in to your SyncFlow boards.',
    children: (
      <form className="space-y-4">
        <TextField label="Email" name="email" defaultValue="taizhixuan@gmail.com" />
        <TextField label="Password" name="password" type="password" defaultValue="hunter2hunter2" />
        <Button type="button" className="w-full">
          Sign in
        </Button>
      </form>
    ),
    footer: <span>New here? Create an account.</span>,
  },
} satisfies Meta<typeof AuthLayout>;

export default meta;

type Story = StoryObj<typeof meta>;

export const SignIn: Story = {};

export const NoSubtitle: Story = { args: { subtitle: undefined, footer: undefined } };
