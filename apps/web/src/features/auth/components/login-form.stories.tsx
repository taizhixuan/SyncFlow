import type { Meta, StoryObj } from '@storybook/react-vite';
import { AuthProvider } from '@/features/auth/auth-context';
import { LoginForm } from './login-form';

const meta: Meta<typeof LoginForm> = {
  title: 'Auth/LoginForm',
  component: LoginForm,
  parameters: { layout: 'centered' },
  // AuthProvider supplies useAuth; MemoryRouter is provided globally in preview.
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
