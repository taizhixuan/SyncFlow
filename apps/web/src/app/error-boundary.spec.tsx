import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AppErrorBoundary } from './error-boundary';

function Boom(): JSX.Element {
  throw new Error('kaboom');
}

describe('AppErrorBoundary', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows a recoverable error screen instead of a blank page when a render throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <AppErrorBoundary>
        <Boom />
      </AppErrorBoundary>,
    );
    expect(screen.getByRole('heading', { name: /something went wrong/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument();
  });

  it('renders its children when nothing throws', () => {
    render(
      <AppErrorBoundary>
        <p>fine</p>
      </AppErrorBoundary>,
    );
    expect(screen.getByText('fine')).toBeInTheDocument();
  });
});
