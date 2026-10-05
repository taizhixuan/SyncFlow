import type { KeyboardEvent } from 'react';

/**
 * True while an input method (Japanese, Chinese, Korean...) is composing. The
 * Enter or Escape that confirms or drops a candidate still arrives as a keydown,
 * so a field that commits on Enter would save half-typed text. keyCode 229 is
 * what Safari reports for the confirming keystroke, after compositionend.
 */
export function isComposing(e: KeyboardEvent): boolean {
  return e.nativeEvent.isComposing || e.keyCode === 229;
}
