import { describe, expect, it } from 'vitest';
import { dashboardGreeting } from './greeting';

const NOW = Date.parse('2026-10-05T12:00:00.000Z');

describe('dashboardGreeting', () => {
  it('welcomes a brand-new account instead of welcoming it "back"', () => {
    expect(dashboardGreeting({ displayName: 'Bea', createdAt: '2026-10-05T11:59:00.000Z' }, NOW)).toBe(
      'Welcome, Bea.',
    );
  });

  it('welcomes a returning user back', () => {
    expect(dashboardGreeting({ displayName: 'Bea', createdAt: '2026-09-01T00:00:00.000Z' }, NOW)).toBe(
      'Welcome back, Bea.',
    );
  });

  it('falls back to "back" when the creation time is unreadable', () => {
    expect(dashboardGreeting({ displayName: 'Bea', createdAt: 'garbage' }, NOW)).toBe('Welcome back, Bea.');
  });
});
