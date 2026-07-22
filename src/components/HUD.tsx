// src/components/HUD.tsx

import type { GamePhase } from '../types/game';
import { TOTAL_ROUNDS } from '../types/game';
import clsx from 'clsx';
import styles from '../styles/HUD.module.css';
import { useFullscreen } from '../hooks/useFullscreen';

// [BLOCK: Round Counter Props]
interface RoundCounterProps {
  round: number;
}

// [BLOCK: Play Footer Props]
// Phase 4 layout redesign: HUD split into RoundCounter (top) and PlayFooter
// (bottom) so RoundHistory can sit between them in the sidebar flex order.
// - onConfirmPlacement: fires when Play is clicked during placement phase
// - onSkip: fast-forwards through the reveal/auto-transition sequence
// - canConfirm: true when all 3 player slots are filled
// - canSkip: true for the entire reveal + auto-transition window
interface PlayFooterProps {
  phase: GamePhase;
  onConfirmPlacement: () => void;
  onSkip: () => void;
  onBackToMenu: () => void;
  canConfirm: boolean;
  canSkip: boolean;
}

// [BLOCK: Round Counter]
export function RoundCounter({ round }: RoundCounterProps) {
  return (
    <div className={styles['hud-sidebar__round']}>
      <span className={styles['hud-sidebar__round-label']}>Round</span>
      <span className={styles['hud-sidebar__round-value']}>
        {Math.min(round, TOTAL_ROUNDS)} / {TOTAL_ROUNDS}
      </span>
    </div>
  );
}

// [BLOCK: Play Footer]
// Button has two active states:
//   "Play" — lit gold, fires onConfirmPlacement (placement phase, 3 slots filled)
//   "Skip" — lit red, fires onSkip (during reveal animation or auto-transition)
// Disabled/dark when neither condition is true (e.g. mid-placement < 3 cards placed)
// [Label] The arrow that used to trail "Skip →" is dropped — the button's
// own red glow (see HUD.module.css's .hud-sidebar__play--skip) already
// distinguishes it from Ready's gold at a glance, so the arrow was
// redundant decoration rather than the thing carrying the meaning.
export function PlayFooter({
  phase,
  onConfirmPlacement,
  onSkip,
  onBackToMenu,
  canConfirm,
  canSkip,
}: PlayFooterProps) {
  const isPlay = canConfirm;
  const isSkip = canSkip;
  const anyActive = isPlay || isSkip;

  // [BLOCK: Mobile Responsiveness — Phase 3: Fullscreen Toggle]
  // Small persistent icon next to "↺ Main Menu", per
  // mobile-responsive-plan.md's Phase 3 suggested placement — lets a
  // player enter/exit fullscreen mid-game without backing out to the
  // Main Menu. Hidden entirely (not a hint) when the Fullscreen API isn't
  // available — unlike MainMenu.tsx's equivalent control, this footer is
  // small and space-constrained, so a silent hide is the better fit here;
  // see useFullscreen.ts's own doc comment for why iOS Safari specifically
  // never supports this at all.
  const { isFullscreen, isSupported: fullscreenSupported, toggleFullscreen } = useFullscreen();

  function handleClick() {
    if (isPlay) onConfirmPlacement();
    else if (isSkip) onSkip();
  }

  return (
    <div className={styles['hud-sidebar__footer']}>
      <button
        className={clsx(
          styles['hud-sidebar__play'],
          isPlay && styles['hud-sidebar__play--ready'],
          isSkip && styles['hud-sidebar__play--skip'],
        )}
        onClick={handleClick}
        disabled={!anyActive || phase === 'gameover'}
      >
        {isSkip ? 'Skip' : 'Play'}
      </button>

      {/* [Mobile Responsiveness — Phase 3] Menu link and fullscreen icon
          sit side by side in their own row now, rather than the menu
          link alone stacked under Play/Skip — see
          HUD.module.css's .hud-sidebar__footer-row. */}
      <div className={styles['hud-sidebar__footer-row']}>
        <button className={styles['hud-sidebar__menu-link']} onClick={onBackToMenu}>
          ↺ Main Menu
        </button>
        {fullscreenSupported && (
          <button
            className={styles['hud-sidebar__fullscreen-btn']}
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? '⤢' : '⛶'}
          </button>
        )}
      </div>
    </div>
  );
}