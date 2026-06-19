import { describe, expect, it } from 'vitest';
import { safeReturnTo } from './auth-utils';

describe('safeReturnTo', () => {
  it('returns /app for null input', () => {
    expect(safeReturnTo(null)).toBe('/app');
  });

  it('returns /app for undefined input', () => {
    expect(safeReturnTo(undefined)).toBe('/app');
  });

  it('returns /app for an absolute external URL (open-redirect guard)', () => {
    expect(safeReturnTo('https://evil.com')).toBe('/app');
    expect(safeReturnTo('http://evil.com/steal?token=abc')).toBe('/app');
  });

  it('returns /app for a protocol-relative URL (open-redirect guard)', () => {
    expect(safeReturnTo('//evil.com')).toBe('/app');
    expect(safeReturnTo('//evil.com/path')).toBe('/app');
  });

  it('honors a normal internal path', () => {
    expect(safeReturnTo('/invite/abc')).toBe('/invite/abc');
    expect(safeReturnTo('/app/board/123')).toBe('/app/board/123');
    expect(safeReturnTo('/app')).toBe('/app');
  });

  it('returns /app for an empty string', () => {
    expect(safeReturnTo('')).toBe('/app');
  });
});
