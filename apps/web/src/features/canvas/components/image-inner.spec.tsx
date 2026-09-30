import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useImage } from './image-inner';

/** Controllable stand-in for window.Image: tests decide when a load settles. */
class FakeImage {
  static all: FakeImage[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  crossOrigin = '';
  src = '';
  constructor() {
    FakeImage.all.push(this);
  }
}

describe('useImage', () => {
  const RealImage = window.Image;
  beforeEach(() => {
    FakeImage.all = [];
    (window as unknown as { Image: unknown }).Image = FakeImage;
  });
  afterEach(() => {
    window.Image = RealImage;
  });

  it('reports an error when the asset fails to load', () => {
    const { result } = renderHook(() => useImage('https://x/broken.png'));
    expect(result.current.status).toBe('loading');
    act(() => FakeImage.all[0]!.onerror?.());
    expect(result.current.status).toBe('error');
    expect(result.current.image).toBeUndefined();
  });

  it('ignores a stale load that settles after the url changed', () => {
    const { result, rerender } = renderHook(({ url }) => useImage(url), {
      initialProps: { url: 'https://x/a.png' },
    });
    const first = FakeImage.all[0]!;
    rerender({ url: 'https://x/b.png' });
    const second = FakeImage.all[1]!;

    act(() => first.onload?.());
    expect(result.current.image).toBeUndefined();
    expect(result.current.status).toBe('loading');

    act(() => second.onload?.());
    expect(result.current.status).toBe('loaded');
    expect(result.current.image).toBe(second);
  });
});
