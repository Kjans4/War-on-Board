// src/hooks/useFullscreen.ts

import { useCallback, useEffect, useState } from 'react';

// [BLOCK: Mobile Responsiveness — Phase 3: Fullscreen Hook]
// Thin wrapper around the Fullscreen API, shared by every place in the
// app that offers a fullscreen toggle (MainMenu's prominent button, and
// the small persistent icon in the game sidebar's footer — see
// mobile-responsive-plan.md's Phase 3). Each caller gets its OWN
// independent instance of this hook — there's no shared React state
// here, just each instance listening to the SAME document-level
// fullscreenchange event, so it stays correct even if more than one
// caller were ever mounted simultaneously (not the case today — Main
// Menu and the in-game footer are never both mounted at once).
//
// [iOS Safari] Has no element Fullscreen API at all, on any current
// version — `isSupported` below is a real feature-detection check, not a
// guess, so each caller can decide how to handle that (hide its button
// entirely, or swap to a hint) rather than rendering a control that
// silently does nothing when tapped.
//
// [webkitRequestFullscreen fallback] Cheap to include for older WebKit
// (desktop Safari historically prefixed this API) — this is NOT legacy-
// browser support work; iOS Safari specifically has no Fullscreen API
// under either name, so this fallback only ever helps a different,
// non-iOS WebKit case, per the plan's decision #4 (modern phones and up,
// no legacy fallback work beyond this one still-current gap).
interface FullscreenAPIElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

interface FullscreenAPIDocument extends Document {
  webkitExitFullscreen?: () => Promise<void> | void;
  webkitFullscreenElement?: Element | null;
}

export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => {
    if (typeof document === 'undefined') return false;
    const doc = document as FullscreenAPIDocument;
    return !!(doc.fullscreenElement || doc.webkitFullscreenElement);
  });

  // Computed once per render rather than stored in state — it never
  // changes for a given browser/session, so there's nothing to react to.
  const isSupported =
    typeof document !== 'undefined' &&
    (typeof document.documentElement.requestFullscreen === 'function' ||
      typeof (document.documentElement as FullscreenAPIElement).webkitRequestFullscreen === 'function');

  useEffect(() => {
    if (typeof document === 'undefined') return;

    function handleChange() {
      const doc = document as FullscreenAPIDocument;
      setIsFullscreen(!!(doc.fullscreenElement || doc.webkitFullscreenElement));
    }

    document.addEventListener('fullscreenchange', handleChange);
    document.addEventListener('webkitfullscreenchange', handleChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleChange);
      document.removeEventListener('webkitfullscreenchange', handleChange);
    };
  }, []);

  const enterFullscreen = useCallback(async () => {
    const el = document.documentElement as FullscreenAPIElement;
    try {
      if (el.requestFullscreen) {
        await el.requestFullscreen();
      } else if (el.webkitRequestFullscreen) {
        await el.webkitRequestFullscreen();
      }
    } catch {
      // Request rejected (e.g. not triggered directly by a user gesture,
      // or the browser otherwise declined) — no-op; the person just
      // stays windowed. Nothing else in the app depends on this
      // succeeding.
      return;
    }

    // [Mobile Responsiveness — Phase 1/3] Retry the orientation lock now
    // that we're inside an active Fullscreen element — this is the one
    // path where screen.orientation.lock() reliably works on supporting
    // browsers (mainly Android Chrome/Edge), so entering fullscreen gets
    // a genuine orientation lock as a bonus on top of App.tsx's own
    // best-effort attempt at game start. The RotatePrompt overlay remains
    // the real, reliable mechanism regardless of whether this succeeds.
    try {
      const orientation = (screen as unknown as { orientation?: { lock?: (o: string) => Promise<void> } }).orientation;
      orientation?.lock?.('landscape')?.catch(() => {});
    } catch {
      // Same no-op outcome as App.tsx's own attempt.
    }
  }, []);

  const exitFullscreen = useCallback(async () => {
    const doc = document as FullscreenAPIDocument;
    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if (doc.webkitExitFullscreen) {
        await doc.webkitExitFullscreen();
      }
    } catch {
      // No-op — nothing else in the app depends on this succeeding; the
      // scale-to-fit canvas (App.module.css's .game-canvas) recalculates
      // on any resize regardless of how/whether fullscreen was exited
      // (Esc, a gesture, or this call).
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (isFullscreen) {
      void exitFullscreen();
    } else {
      void enterFullscreen();
    }
  }, [isFullscreen, enterFullscreen, exitFullscreen]);

  return { isFullscreen, isSupported, toggleFullscreen };
}