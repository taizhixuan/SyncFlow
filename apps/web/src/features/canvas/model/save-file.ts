/**
 * Save a Blob to disk. Uses the File System Access API (a native Save dialog, so
 * the user chooses the folder + filename) when the browser supports it, and
 * falls back to a normal download otherwise. `accept` maps a MIME type to its
 * file extensions so the picker enforces the chosen format.
 */
interface SaveFilePickerWindow {
  showSaveFilePicker?: (opts: {
    suggestedName?: string;
    types?: { description?: string; accept: Record<string, string[]> }[];
  }) => Promise<{
    createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }>;
  }>;
}

export async function saveFile(
  blob: Blob,
  suggestedName: string,
  accept: Record<string, string[]>,
): Promise<void> {
  const picker = (window as unknown as SaveFilePickerWindow).showSaveFilePicker;
  if (typeof picker === 'function') {
    try {
      const handle = await picker({ suggestedName, types: [{ description: 'Export', accept }] });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err) {
      // User dismissed the dialog — do nothing, don't fall back to a download.
      if (err instanceof DOMException && err.name === 'AbortError') return;
      // Any other failure: fall through to the download fallback below.
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName;
  a.click();
  URL.revokeObjectURL(url);
}

/** Convert a base64 data URL (e.g. from Konva's toDataURL) into a Blob. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',');
  const head = dataUrl.slice(0, comma);
  const body = dataUrl.slice(comma + 1);
  const mime = /data:(.*?);base64/.exec(head)?.[1] ?? 'application/octet-stream';
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
