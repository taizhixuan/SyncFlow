import { describe, expect, it } from 'vitest';
import { validateLogin, validateSignup } from './auth-validation';

describe('validateLogin', () => {
  it('names each missing field instead of a generic failure', () => {
    expect(validateLogin({ email: '', password: '' })).toEqual({
      email: 'Enter your email address.',
      password: 'Enter your password.',
    });
  });

  it('flags a malformed email and accepts any non-empty password', () => {
    expect(validateLogin({ email: 'not-an-email', password: 'x' })).toEqual({ email: 'Enter a valid email address.' });
    expect(validateLogin({ email: 'a@b.co', password: 'x' })).toEqual({});
  });
});

describe('validateSignup', () => {
  it('reports every field that is wrong, each with its own reason', () => {
    expect(validateSignup({ email: 'not-an-email', password: 'short', displayName: '' })).toEqual({
      email: 'Enter a valid email address.',
      password: 'Use at least 8 characters.',
      displayName: 'Enter a display name.',
    });
  });

  it('passes valid details', () => {
    expect(validateSignup({ email: 'a@b.co', password: 'longenough', displayName: 'Ana' })).toEqual({});
  });
});
