// src/components/HUD.tsx

import type { GamePhase } from '../types/game';
import { TOTAL_ROUNDS } from '../types/game';
import clsx from 'clsx';
import styles from '../styles/HUD.module.css';

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
      <button className={styles['hud-sidebar__menu-link']} onClick={onBackToMenu}>
        ↺ Main Menu
      </button>
    </div>
  );
}