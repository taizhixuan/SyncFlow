import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import * as authContext from '@/features/auth/auth-context';
import { ProtectedRoute } from './protected-route';
import { ROUTER_FUTURE } from './router-future';

vi.mock('@/features/auth/auth-context', async (importOriginal) => {
  const real = await importOriginal<typeof authContext>();
  return { ...real, useAuth: vi.fn(), useSessionProbe: vi.fn() };
});

const retry = vi.fn();
const confirm = vi.fn();

function mockStatus(status: authContext.AuthStatus, { unconfirmed = false } = {}): void {
  vi.mocked(authContext.useSessionProbe).mockReturnValue({ unconfirmed, confirm });
  vi.mocked(authContext.useAuth).mockReturnValue({
    status,
    user: null,
    login: vi.fn(),
    signup: vi.fn(),
    logout: vi.fn(),
    updateUser: vi.fn(),
    retry,
  });
}

function LoginProbe(): JSX.Element {
  const location = useLocation();
  return <p data-testid="login">{location.search}</p>;
}

function renderAt(path: string): void {
  render(
    <MemoryRouter initialEntries={[path]} future={ROUTER_FUTURE}>
      <Routes>
        <Route path="/login" element={<LoginProbe />} />
        <Route
          path="/app/board/:id"
          element={
            <ProtectedRoute>
              <p>secret board</p>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    retry.mockReset();
    confirm.mockReset();
  });

  it('redirects anonymous users to /login, preserving where they were going', () => {
    mockStatus('anonymous');
    renderAt('/app/board/b1?focus=el9');
    const search = new URLSearchParams(screen.getByTestId('login').textContent ?? '');
    expect(search.get('returnTo')).toBe('/app/board/b1?focus=el9');
  });

  // The signed-out hint is per web origin but the session cookie belongs to the
  // API, so the hint can be wrong (apex vs www, a preview URL). A protected
  // route asks the server once before sending the user to log in.
  it('confirms a hint-only signed-out state with the server before redirecting', () => {
    mockStatus('anonymous', { unconfirmed: true });
    renderAt('/app/board/b1');
    expect(confirm).toHaveBeenCalledOnce();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByTestId('login')).not.toBeInTheDocument();
  });

  it('redirects without asking again once the server has said signed out', () => {
    mockStatus('anonymous');
    renderAt('/app/board/b1');
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByTestId('login')).toBeInTheDocument();
  });

  it('shows an error state with a retry when the session check failed', async () => {
    mockStatus('error');
    renderAt('/app/board/b1');
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn.t reach/i);
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.queryByText('secret board')).not.toBeInTheDocument();
  });

  it('renders a full-dynamic-viewport loading state', () => {
    mockStatus('loading');
    renderAt('/app/board/b1');
    expect(screen.getByRole('status')).toHaveClass('min-h-[100dvh]');
  });

  it('renders children when authenticated', () => {
    mockStatus('authenticated');
    renderAt('/app/board/b1');
    expect(screen.getByText('secret board')).toBeInTheDocument();
  });
});
