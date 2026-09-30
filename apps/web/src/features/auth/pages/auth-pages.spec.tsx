import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ROUTER_FUTURE } from '@/app/router-future';
import * as authContext from '../auth-context';
import { LoginPage } from './login-page';
import { SignupPage } from './signup-page';

vi.mock('../auth-context', async (importOriginal) => {
  const real = await importOriginal<typeof authContext>();
  return { ...real, useAuth: vi.fn() };
});

function renderAt(path: string, page: JSX.Element): void {
  render(
    <MemoryRouter initialEntries={[path]} future={ROUTER_FUTURE}>
      {page}
    </MemoryRouter>,
  );
}

describe('auth page cross-links', () => {
  beforeEach(() => {
    vi.mocked(authContext.useAuth).mockReturnValue({
      status: 'anonymous',
      user: null,
      login: vi.fn(),
      signup: vi.fn(),
      logout: vi.fn(),
      updateUser: vi.fn(),
      retry: vi.fn(),
    });
  });

  it('keeps returnTo on the "Create an account" link (invite flow)', () => {
    renderAt('/login?returnTo=%2Finvite%2Fabc', <LoginPage />);
    expect(screen.getByRole('link', { name: /create an account/i })).toHaveAttribute(
      'href',
      '/signup?returnTo=%2Finvite%2Fabc',
    );
  });

  it('keeps returnTo on the "Log in" link', () => {
    renderAt('/signup?returnTo=%2Finvite%2Fabc', <SignupPage />);
    expect(screen.getByRole('link', { name: /log in/i })).toHaveAttribute(
      'href',
      '/login?returnTo=%2Finvite%2Fabc',
    );
  });

  it('drops an unsafe returnTo instead of forwarding it', () => {
    renderAt('/login?returnTo=%2F%5Cevil.com', <LoginPage />);
    expect(screen.getByRole('link', { name: /create an account/i })).toHaveAttribute('href', '/signup');
  });
});
