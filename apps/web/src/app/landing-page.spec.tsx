import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as authContext from '@/features/auth/auth-context';
import { AuthLayout } from '@/features/auth/components/auth-layout';
import { LandingPage } from './landing-page';
import { ROUTER_FUTURE } from './router-future';

vi.mock('@/hooks/use-api-health', () => ({
  useApiHealth: () => ({ state: { phase: 'loading' }, refresh: vi.fn() }),
}));
vi.mock('@/features/auth/auth-context', async (importOriginal) => {
  const real = await importOriginal<typeof authContext>();
  return { ...real, useAuth: vi.fn() };
});

// Emoji / dingbat glyphs render inconsistently across OSes (CLAUDE.md: lucide only).
const GLYPHS = /[←-⇿─-➿\u{1F300}-\u{1FAFF}]/u;

describe('glyph-free chrome with dynamic viewport height', () => {
  it('LandingPage uses icons, not glyphs, and 100dvh', () => {
    vi.mocked(authContext.useAuth).mockReturnValue({
      status: 'anonymous',
      user: null,
      login: vi.fn(),
      signup: vi.fn(),
      logout: vi.fn(),
      updateUser: vi.fn(),
      retry: vi.fn(),
    });
    const { container } = render(
      <MemoryRouter future={ROUTER_FUTURE}>
        <LandingPage />
      </MemoryRouter>,
    );
    expect(container.textContent).not.toMatch(GLYPHS);
    const tryLink = screen.getAllByRole('link', { name: /try the canvas/i })[0]!;
    expect(tryLink.querySelector('svg')).not.toBeNull();
    expect(container.querySelector('main')).toHaveClass('min-h-[100dvh]');
  });

  it('AuthLayout uses icons, not glyphs, and 100dvh', () => {
    const { container } = render(
      <MemoryRouter future={ROUTER_FUTURE}>
        <AuthLayout title="t">x</AuthLayout>
      </MemoryRouter>,
    );
    expect(container.textContent).not.toMatch(GLYPHS);
    expect(container.querySelector('main')).toHaveClass('min-h-[100dvh]');
  });
});
