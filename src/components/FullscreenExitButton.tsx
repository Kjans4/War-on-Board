// src/components/FullscreenExitButton.tsx

import styles from '../styles/FullscreenExitButton.module.css';
import { useFullscreen } from '../hooks/useFullscreen';

// [BLOCK: Mobile Responsiveness — Fullscreen Exit Button]
// A persistent, clearly visible way out of fullscreen while a round is
// in progress. HUD.tsx's PlayFooter already has a small fullscreen
// toggle icon next to "↺ Main Menu", but it's tucked inside the
// sidebar's footer — easy to miss for someone who just wants a quick,
// obvious way back out, especially on a touch device where the browser's
// own fullscreen-exit affordance (Esc key, a system gesture/swipe) isn't
// always obvious or consistent across browsers/OSes. This renders
// nothing at all outside fullscreen (see useFullscreen's own
// isFullscreen tracking) — it's not a second permanent control, just a
// contextual one that only appears when it's actually needed.
//
// Deliberately styled and z-indexed to sit ABOVE RotatePrompt (see
// FullscreenExitButton.module.css's z-index: 700 vs. RotatePrompt's 600)
// — a player who entered fullscreen and then ends up in portrait (or
// never left it) needs to still be able to back out of fullscreen even
// while the rotate overlay is covering the game underneath. Without
// this, that combination would leave someone looking at a rotate prompt
// with no visible way out at all.
//
// Rendered by App.tsx only in the game branch (not on the Main Menu,
// which has its own prominent fullscreen button already) — as a sibling
// of .game-canvas-viewport, never a descendant of the scaled canvas, for
// the same reason RotatePrompt itself has to be: `position: fixed`
// inside a `transform`-ed ancestor stops resolving against the real
// viewport.
export function FullscreenExitButton() {
  const { isFullscreen, toggleFullscreen } = useFullscreen();

  if (!isFullscreen) return null;

  return (
    <button
      className={styles['fullscreen-exit']}
      onClick={toggleFullscreen}
      title="Exit fullscreen"
      aria-label="Exit fullscreen"
    >
      ⤢
    </button>
  );
}