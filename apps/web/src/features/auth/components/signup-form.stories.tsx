import type { Meta, StoryObj } from '@storybook/react-vite';
import { AuthProvider } from '@/features/auth/auth-context';
import { SignupForm } from './signup-form';

const meta: Meta<typeof SignupForm> = {
  title: 'Auth/SignupForm',
  component: SignupForm,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div style={{ width: 360 }}>
        <AuthProvider>
          <Story />
        </AuthProvider>
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
