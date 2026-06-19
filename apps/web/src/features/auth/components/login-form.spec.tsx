import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ApiError } from '@/lib/api-client';
import * as authApi from '../api/auth-api';
import { AuthProvider } from '../auth-context';
import { LoginForm } from './login-form';

vi.mock('../api/auth-api');

function renderForm(): void {
  render(
    <MemoryRouter>
      <AuthProvider>
        <LoginForm />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('LoginForm', () => {
  beforeEach(() => {
    vi.mocked(authApi.restoreSession).mockResolvedValue(null);
  });

  it('surfaces a friendly error when credentials are rejected', async () => {
    vi.mocked(authApi.login).mockRejectedValue(new ApiError(401, 'Invalid credentials'));
    renderForm();

    await userEvent.type(screen.getByLabelText('Email'), 'maya@syncflow.app');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/wrong email or password/i);
  });
});
