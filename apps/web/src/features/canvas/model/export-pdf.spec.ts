import { describe, expect, it } from 'vitest';
import { fitImageInPage } from './export-pdf';

describe('fitImageInPage', () => {
  it('portrait image on landscape page — fits within page bounds', () => {
    // Image: 400w x 800h (portrait), Page: 1000w x 600h (landscape)
    const result = fitImageInPage(400, 800, 1000, 600);
    // Scale limited by height: scale = 600/800 = 0.75 → w=300, h=600
    expect(result.w).toBeCloseTo(300);
    expect(result.h).toBeCloseTo(600);
    // Centered horizontally
    expect(result.x).toBeCloseTo((1000 - 300) / 2);
    expect(result.y).toBeCloseTo(0);
  });

  it('landscape image on portrait page — fits within page bounds', () => {
    // Image: 800w x 400h (landscape), Page: 600w x 1000h (portrait)
    const result = fitImageInPage(800, 400, 600, 1000);
    // Scale limited by width: scale = 600/800 = 0.75 → w=600, h=300
    expect(result.w).toBeCloseTo(600);
    expect(result.h).toBeCloseTo(300);
    // Centered vertically
    expect(result.x).toBeCloseTo(0);
    expect(result.y).toBeCloseTo((1000 - 300) / 2);
  });

  it('square image fills to the smaller page dimension', () => {
    const result = fitImageInPage(100, 100, 200, 300);
    expect(result.w).toBeCloseTo(200);
    expect(result.h).toBeCloseTo(200);
    expect(result.x).toBeCloseTo(0);
    expect(result.y).toBeCloseTo(50);
  });
});
