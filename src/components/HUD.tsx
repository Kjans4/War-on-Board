// src/components/HUD.tsx

import type { GamePhase } from '../types/game';
import { TOTAL_ROUNDS } from '../types/game';
import clsx from 'clsx';

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
    <div className="hud-sidebar__round">
      <span className="hud-sidebar__round-label">Round</span>
      <span className="hud-sidebar__round-value">
        {Math.min(round, TOTAL_ROUNDS)} / {TOTAL_ROUNDS}
      </span>
    </div>
  );
}

// [BLOCK: Play Footer]
// Button has two active states:
//   "Play"   — lit gold, fires onConfirmPlacement (placement phase, 3 slots filled)
//   "Skip →" — dim, fires onSkip (during reveal animation or auto-transition)
// Disabled/dark when neither condition is true (e.g. mid-placement < 3 cards placed)
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
    <div className="hud-sidebar__footer">
      <button
        className={clsx(
          'hud-sidebar__play',
          isPlay && 'hud-sidebar__play--ready',
          isSkip && 'hud-sidebar__play--skip',
        )}
        onClick={handleClick}
        disabled={!anyActive || phase === 'gameover'}
      >
        {isSkip ? 'Skip →' : 'Play'}
      </button>
      <button className="hud-sidebar__menu-link" onClick={onBackToMenu}>
        ↺ Main Menu
      </button>
    </div>
  );
}

// [BLOCK: Styles]
export const hudStyles = `
  .hud-sidebar__round {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 4px 2px 16px;
    flex-shrink: 0;
  }

  .hud-sidebar__round-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #555;
    font-weight: 600;
  }

  .hud-sidebar__round-value {
    font-size: 26px;
    font-weight: 700;
    color: #ddd;
    font-variant-numeric: tabular-nums;
  }

  .hud-sidebar__footer {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 12px;
  }

  .hud-sidebar__play {
    padding: 12px;
    border-radius: 9px;
    border: 2px solid #333;
    background: transparent;
    color: #555;
    font-size: 16px;
    font-weight: 700;
    letter-spacing: 0.04em;
    cursor: not-allowed;
    transition: border-color 0.15s, color 0.15s, background 0.15s, box-shadow 0.15s;
  }

  /* Lit gold — placement confirmed, all 3 slots filled */
  .hud-sidebar__play--ready {
    border-color: #f0c040;
    color: #f0c040;
    background: rgba(240,192,64,0.08);
    box-shadow: 0 0 16px rgba(240,192,64,0.25);
    cursor: pointer;
  }
  .hud-sidebar__play--ready:hover {
    background: rgba(240,192,64,0.16);
  }

  /* Dim skip — visible during reveal/transition, less prominent than Play */
  .hud-sidebar__play--skip {
    border-color: #444;
    color: #666;
    cursor: pointer;
  }
  .hud-sidebar__play--skip:hover {
    border-color: #666;
    color: #999;
  }

  .hud-sidebar__menu-link {
    padding: 6px;
    border: none;
    background: transparent;
    color: #555;
    font-size: 12px;
    cursor: pointer;
    transition: color 0.15s;
  }
  .hud-sidebar__menu-link:hover {
    color: #999;
  }
`;