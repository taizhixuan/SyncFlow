import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusables(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('inert') && el.getAttribute('aria-hidden') !== 'true',
  );
}

interface DialogFocusOptions {
  /** Called on Escape. */
  onClose: () => void;
  /** Keep Tab inside the container (modal dialogs). Side panels leave it off. */
  trap?: boolean;
  /** For always-mounted panels: manage focus only while open. Defaults to true. */
  active?: boolean;
}

/**
 * Focus management for dialogs and side panels, applied while `active` (by
 * default, while the caller is mounted): moves focus inside on open, closes on
 * Escape, optionally traps Tab, and hands focus back to the opener on close.
 */
export function useDialogFocus(
  containerRef: RefObject<HTMLElement>,
  { onClose, trap = false, active = true }: DialogFocusOptions,
): void {
  // Callers often pass an inline onClose; a ref keeps the effect from re-running
  // (and re-stealing focus) on every render.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const container = containerRef.current;
    if (!active || !container) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const initial = focusables(container)[0];
    if (initial) {
      initial.focus();
    } else {
      if (!container.hasAttribute('tabindex')) container.setAttribute('tabindex', '-1');
      container.focus();
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (!trap || event.key !== 'Tab') return;
      const items = focusables(container);
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) {
        event.preventDefault();
        return;
      }
      const focused = document.activeElement;
      if (event.shiftKey && (focused === first || !container.contains(focused))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (focused === last || !container.contains(focused))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (opener?.isConnected) opener.focus();
    };
  }, [containerRef, trap, active]);
}
