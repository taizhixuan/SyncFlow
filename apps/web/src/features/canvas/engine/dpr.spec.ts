import { describe, expect, it } from 'vitest';

import {
  DEFAULT_MAX_DPR,
  MIN_RENDER_DPR,
  clampDpr,
  readDevicePixelRatio,
  snapHairlineScreen,
} from './dpr';

describe('clampDpr', () => {
  const small = { width: 800, height: 600 };

  it('supersamples a display that asks for less than the render floor', () => {
    // A fractionally-scaled Windows display reporting 1.425 still renders at 2x
    // and gets downscaled by the compositor — that is the sharpness win.
    expect(clampDpr(1.4249999523162842, small)).toBe(MIN_RENDER_DPR);
    expect(clampDpr(1, small)).toBe(MIN_RENDER_DPR);
  });

  it('does not quantise the display ratio when it is above the floor', () => {
    // Rounding here would leave the backing store a fraction of a percent off
    // the real device size, and the compositor would resample the whole canvas.
    const messyRatio = 2.75 - 1e-7; // the sort of value fractional scaling reports
    expect(clampDpr(messyRatio, small)).toBe(messyRatio);
  });

  it('caps a high-density display at the configured maximum', () => {
    expect(clampDpr(4, small)).toBe(DEFAULT_MAX_DPR);
    expect(clampDpr(4, small, { maxDpr: 1.5 })).toBe(1.5);
  });

  it('never returns below 1', () => {
    expect(clampDpr(0.5, small)).toBe(MIN_RENDER_DPR);
    expect(clampDpr(0.5, small, { minDpr: 1 })).toBe(1);
  });

  it('gives up supersampling when the viewport blows the backing-store budget', () => {
    // 6 layers x 2560x1440 = 22.1 Mpx logical. The 48 Mpx budget affords about
    // sqrt(48/22.1) = 1.47, so the 2x floor has to yield.
    const big = clampDpr(1, { width: 2560, height: 1440 });
    expect(big).toBeLessThan(MIN_RENDER_DPR);
    expect(big).toBeGreaterThan(1);
  });

  it('never drops below the display ratio, however tight the budget', () => {
    // Correctness beats quality: rendering under the device ratio would force
    // the compositor to upscale, which is the blur this module exists to stop.
    expect(clampDpr(2, { width: 8000, height: 8000 }, { pixelBudget: 1000 })).toBe(2);
    expect(clampDpr(3, { width: 8000, height: 8000 }, { pixelBudget: 1000, maxDpr: 2.5 })).toBe(2.5);
  });

  it('scales the budget with the layer count', () => {
    const size = { width: 1600, height: 1000 };
    expect(clampDpr(1, size, { layers: 1 })).toBeGreaterThan(clampDpr(1, size, { layers: 12 }));
  });

  it('falls back to the render floor for a nonsense ratio', () => {
    expect(clampDpr(Number.NaN, small)).toBe(MIN_RENDER_DPR);
    expect(clampDpr(0, small)).toBe(MIN_RENDER_DPR);
  });
});

describe('snapHairlineScreen', () => {
  it('puts a 1-device-pixel line on a half-pixel at dpr 1', () => {
    expect(snapHairlineScreen(10, 1)).toBe(10.5);
    expect(snapHairlineScreen(10.4, 1)).toBe(10.5);
  });

  it('puts a 2-device-pixel line on a whole logical pixel at dpr 2', () => {
    // width is 2 device px, so the run is aligned when it is centred on an
    // integer device coordinate — which is a whole logical pixel here.
    expect(snapHairlineScreen(10.3, 2)).toBe(10.5);
    expect(snapHairlineScreen(10.1, 2)).toBe(10);
  });

  it('moves the coordinate by less than one logical pixel', () => {
    for (const dpr of [1, 1.5, 2]) {
      for (const x of [0, 3.2, 17.9, 240.51]) {
        expect(Math.abs(snapHairlineScreen(x, dpr) - x)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('passes non-finite input through untouched', () => {
    expect(snapHairlineScreen(Number.NaN, 1)).toBeNaN();
    expect(snapHairlineScreen(5, 0)).toBe(5);
  });
});

describe('readDevicePixelRatio', () => {
  it('returns a usable positive number', () => {
    expect(readDevicePixelRatio()).toBeGreaterThan(0);
  });
});
