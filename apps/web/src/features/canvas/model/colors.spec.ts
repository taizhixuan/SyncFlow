import { describe, expect, it } from 'vitest';
import { resolveStroke, resolveFill } from './colors';

describe('color resolution', () => {
  it("resolves 'auto' stroke to near-black in light and near-white in dark", () => {
    expect(resolveStroke('auto', 'light')).toBe('#1A1A22');
    expect(resolveStroke('auto', 'dark')).toBe('#F4F4F2');
  });
  it('passes an explicit hex through unchanged in both themes', () => {
    expect(resolveStroke('#3B5BFF', 'light')).toBe('#3B5BFF');
    expect(resolveStroke('#3B5BFF', 'dark')).toBe('#3B5BFF');
  });
  it("resolves 'auto' fill to undefined (transparent) and null to undefined", () => {
    expect(resolveFill('auto', 'light')).toBeUndefined();
    expect(resolveFill(null, 'dark')).toBeUndefined();
    expect(resolveFill('#FFFFFF', 'light')).toBe('#FFFFFF');
  });
});
