import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ROUTER_FUTURE } from '@/app/router-future';
import { ApiError } from '@/lib/api-client';
import * as authApi from '../api/auth-api';
import { AuthProvider } from '../auth-context';
import { LoginForm } from './login-form';

vi.mock('../api/auth-api');

function renderForm(): void {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter future={ROUTER_FUTURE}>
        <AuthProvider>
          <LoginForm />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
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

  it('sends an unusual address to the server and explains its rejection on the email field', async () => {
    vi.mocked(authApi.login).mockRejectedValue(new ApiError(422, 'email must be an email'));
    renderForm();

    await userEvent.type(screen.getByLabelText('Email'), 'not-an-email');
    await userEvent.type(screen.getByLabelText('Password'), 'pw');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));

    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(authApi.login).toHaveBeenCalledWith({ email: 'not-an-email', password: 'pw' });
  });
});
