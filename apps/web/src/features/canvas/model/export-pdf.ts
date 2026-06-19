/**
 * PDF export utilities.
 *
 * `fitImageInPage` is a pure geometry helper (unit-tested).
 * `exportBoardPdf` and `exportSlidePdf` are IO functions that dynamically
 * import jsPDF and trigger a browser download — they are not unit-tested.
 */

// ─── Pure geometry helper (unit-tested) ──────────────────────────────────────

/**
 * Compute the position and size to draw an image inside a page rectangle,
 * preserving the image's aspect ratio and centering it within the page.
 */
export function fitImageInPage(
  imgW: number,
  imgH: number,
  pageW: number,
  pageH: number,
): { x: number; y: number; w: number; h: number } {
  const scale = Math.min(pageW / imgW, pageH / imgH);
  const w = imgW * scale;
  const h = imgH * scale;
  const x = (pageW - w) / 2;
  const y = (pageH - h) / 2;
  return { x, y, w, h };
}

// ─── IO: board PDF (single page) ──────────────────────────────────────────────

/**
 * Export the whole board as a single-page PDF.
 * Orientation is chosen automatically based on the image aspect ratio.
 */
export async function exportBoardPdf(
  pngDataUrl: string,
  size: { w: number; h: number },
): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const orientation: 'l' | 'p' = size.w >= size.h ? 'l' : 'p';
  // Use A4 in mm; we scale the image to fit.
  const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const { x, y, w, h } = fitImageInPage(size.w, size.h, pageW, pageH);
  pdf.addImage(pngDataUrl, 'PNG', x, y, w, h);
  return pdf.output('blob');
}

// ─── IO: slide PDF (one frame per page) ───────────────────────────────────────

/**
 * Export a sequence of frame PNGs as a multi-page PDF, one frame per page.
 * Each page is sized to match the frame's logical canvas dimensions.
 */
export async function exportSlidePdf(
  framePngs: { dataUrl: string; size: { w: number; h: number } }[],
): Promise<Blob | null> {
  if (framePngs.length === 0) return null;
  const { jsPDF } = await import('jspdf');

  const first = framePngs[0]!;
  const orientation: 'l' | 'p' = first.size.w >= first.size.h ? 'l' : 'p';
  const pdf = new jsPDF({ orientation, unit: 'pt', format: [first.size.w, first.size.h] });

  for (let i = 0; i < framePngs.length; i++) {
    const { dataUrl, size } = framePngs[i]!;
    if (i > 0) {
      const frameOrientation: 'l' | 'p' = size.w >= size.h ? 'l' : 'p';
      pdf.addPage([size.w, size.h], frameOrientation);
    }
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const { x, y, w, h } = fitImageInPage(size.w, size.h, pageW, pageH);
    pdf.addImage(dataUrl, 'PNG', x, y, w, h);
  }

  return pdf.output('blob');
}
