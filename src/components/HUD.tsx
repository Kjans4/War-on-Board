// src/components/HUD.tsx

import type { GamePhase } from '../types/game';
import { TOTAL_ROUNDS } from '../types/game';
import clsx from 'clsx';

// [BLOCK: Props]
// Phase 4 layout redesign: HUD is now split into two sidebar pieces —
// RoundCounter (top) and PlayFooter (bottom) — so RoundHistory can sit
// between them in the sidebar's flex order (round -> history -> play),
// matching the layout sketch. Difficulty selector moved to MainMenu.tsx.
// Stack counts moved to Board.tsx (battlefield edges).
interface RoundCounterProps {
  round: number;
}

interface PlayFooterProps {
  phase: GamePhase;
  onConfirmPlacement: () => void;
  onNextRound: () => void;
  onBackToMenu: () => void;
  canConfirm: boolean;   // true when all 3 player slots are filled (placement phase)
  canAdvance: boolean;   // true during resolution phase (ready for next round)
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
// The Play button lights up (becomes enabled) once it has a valid action:
// all 3 slots filled during placement, or resolution phase ready to advance.
export function PlayFooter({
  phase,
  onConfirmPlacement,
  onNextRound,
  onBackToMenu,
  canConfirm,
  canAdvance,
}: PlayFooterProps) {
  const playReady = canConfirm || canAdvance;

  function handlePlayClick() {
    if (canConfirm) onConfirmPlacement();
    else if (canAdvance) onNextRound();
  }

  return (
    <div className="hud-sidebar__footer">
      <button
        className={clsx('hud-sidebar__play', playReady && 'hud-sidebar__play--ready')}
        onClick={handlePlayClick}
        disabled={!playReady || phase === 'gameover'}
      >
        Play
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