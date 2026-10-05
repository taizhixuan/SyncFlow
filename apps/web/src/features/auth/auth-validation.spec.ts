import { describe, expect, it } from 'vitest';
import { validateLogin, validateSignup } from './auth-validation';

// Addresses the API's IsEmail accepts but a strict client regex rejected, which
// locked their owners out of the login form.
const UNUSUAL_BUT_VALID = ['a+b!c@x.com', 'josé@example.com', 'user@münchen.de'];

describe('validateLogin', () => {
  it('names each missing field instead of a generic failure', () => {
    expect(validateLogin({ email: '', password: '' })).toEqual({
      email: 'Enter your email address.',
      password: 'Enter your password.',
    });
  });

  it('leaves judging the email to the server and accepts any non-empty password', () => {
    expect(validateLogin({ email: 'a@b.co', password: 'x' })).toEqual({});
    expect(validateLogin({ email: 'not-an-email', password: 'x' })).toEqual({});
  });

  it.each(UNUSUAL_BUT_VALID)('lets %s through to the server', (email) => {
    expect(validateLogin({ email, password: 'x' })).toEqual({});
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

  it.each(UNUSUAL_BUT_VALID)('accepts %s, which the server accepts too', (email) => {
    expect(validateSignup({ email, password: 'longenough', displayName: 'Ana' })).toEqual({});
  });

  it.each(['a@', '@b.co', 'a b@c.co'])('rejects %j, which no server rule could accept', (email) => {
    expect(validateSignup({ email, password: 'longenough', displayName: 'Ana' })).toEqual({
      email: 'Enter a valid email address.',
    });
  });

  it('treats a whitespace-only display name as missing (the server trims it)', () => {
    expect(validateSignup({ email: 'a@b.co', password: 'longenough', displayName: '   ' })).toEqual({
      displayName: 'Enter a display name.',
    });
  });

  // The API counts characters (code points); an emoji is two UTF-16 units.
  it('counts display name and password length in characters, as the server does', () => {
    expect(
      validateSignup({ email: 'a@b.co', password: '🔑'.repeat(8), displayName: '😀'.repeat(60) }),
    ).toEqual({});
    expect(
      validateSignup({ email: 'a@b.co', password: 'longenough', displayName: '😀'.repeat(61) }),
    ).toEqual({ displayName: 'Use at most 60 characters.' });
  });
});
