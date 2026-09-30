import { useEffect, useRef, type RefObject } from 'react';

/**
 * Focus management for the canvas side panels (comments, templates, library).
 *
 * On open, focus moves into the panel so keyboard and screen-reader users land
 * where the content is; Escape closes it; on close, focus goes back to whatever
 * opened it (usually the top-bar toggle) instead of falling to <body>.
 */
export function usePanelFocus<T extends HTMLElement>(
  open: boolean,
  onClose: () => void,
): RefObject<T> {
  const ref = useRef<T>(null);
  // Read through a ref so a parent passing an inline arrow does not re-run the
  // open/close effect (which would steal focus back on every render).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = ref.current;
    if (panel && !panel.contains(document.activeElement)) {
      const first = panel.querySelector<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      (first ?? panel).focus();
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onCloseRef.current();
    };
    panel?.addEventListener('keydown', onKey);
    return () => {
      panel?.removeEventListener('keydown', onKey);
      if (previous && previous.isConnected) previous.focus();
    };
  }, [open]);

  return ref;
}
