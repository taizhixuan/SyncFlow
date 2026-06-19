import { describe, expect, it } from 'vitest';
import {
  resolveFill,
  resolveFrameBorder,
  resolveFrameFill,
  resolveMindEdgeColor,
  resolveMindNodeBorder,
  resolveMindNodeFill,
  resolveStroke,
  MINDNODE_DEFAULT_BORDER,
} from './colors';

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

describe('resolveMindNodeBorder', () => {
  it('returns the default indigo when stroke is auto', () => {
    expect(resolveMindNodeBorder('auto', 'light')).toBe(MINDNODE_DEFAULT_BORDER);
    expect(resolveMindNodeBorder('auto', 'dark')).toBe(MINDNODE_DEFAULT_BORDER);
  });
  it('passes an explicit hex stroke through (recolor works)', () => {
    expect(resolveMindNodeBorder('#FF0000', 'light')).toBe('#FF0000');
    expect(resolveMindNodeBorder('#FF0000', 'dark')).toBe('#FF0000');
  });
});

describe('resolveMindNodeFill', () => {
  it('returns theme-aware default when fill is auto or null', () => {
    expect(resolveMindNodeFill('auto', 'light', false)).toBe('#EEF2FF');
    expect(resolveMindNodeFill(null, 'dark', false)).toBe('#2D2D3A');
    expect(resolveMindNodeFill(undefined, 'light', true)).toBe('#E0E7FF');
    expect(resolveMindNodeFill(null, 'dark', true)).toBe('#3D3D50');
  });
  it('returns the explicit fill hex unchanged (recolor works)', () => {
    expect(resolveMindNodeFill('#ABCDEF', 'light', false)).toBe('#ABCDEF');
    expect(resolveMindNodeFill('#ABCDEF', 'dark', true)).toBe('#ABCDEF');
  });
});

describe('resolveMindEdgeColor', () => {
  it('returns a lighter indigo in dark mode for contrast', () => {
    const light = resolveMindEdgeColor('light');
    const dark = resolveMindEdgeColor('dark');
    expect(light).toBe('#6366F1');
    expect(dark).toBe('#818CF8');
  });
});

describe('resolveFrameBorder', () => {
  it('returns subtle rgba defaults when stroke is auto', () => {
    expect(resolveFrameBorder('auto', 'light')).toBe('rgba(0,0,0,0.15)');
    expect(resolveFrameBorder('auto', 'dark')).toBe('rgba(255,255,255,0.15)');
  });
  it('passes an explicit stroke hex through (recolor works)', () => {
    expect(resolveFrameBorder('#00FF00', 'light')).toBe('#00FF00');
    expect(resolveFrameBorder('#00FF00', 'dark')).toBe('#00FF00');
  });
});

describe('resolveFrameFill', () => {
  it('returns near-transparent fill per theme', () => {
    expect(resolveFrameFill('light')).toBe('rgba(0,0,0,0.02)');
    expect(resolveFrameFill('dark')).toBe('rgba(255,255,255,0.03)');
  });
});
