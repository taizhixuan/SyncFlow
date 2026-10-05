import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, useTheme } from './theme';

function Probe(): JSX.Element {
  const { theme, toggle } = useTheme();
  return <button onClick={toggle}>theme:{theme}</button>;
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });
  it('toggles theme and applies the dark class to <html>', async () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByRole('button')).toHaveTextContent('theme:light');
    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).toHaveTextContent('theme:dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it("doesn't save the OS-derived default as if the user had chosen it", async () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    // Saving the default would freeze it: a later OS switch would never apply.
    expect(localStorage.getItem('syncflow:theme')).toBeNull();
    await userEvent.click(screen.getByRole('button'));
    expect(localStorage.getItem('syncflow:theme')).toBe('dark');
  });
});
