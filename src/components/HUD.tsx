// src/components/HUD.tsx

import type { AIDifficulty, GamePhase } from '../types/game';
import { TOTAL_ROUNDS } from '../types/game';
import clsx from 'clsx';

// [BLOCK: Props]
interface HUDProps {
  round: number;
  phase: GamePhase;
  playerCardCount: number;  // stack + hand
  aiCardCount: number;
  playerStackCount: number;
  aiStackCount: number;
  difficulty: AIDifficulty;
  onSetDifficulty: (d: AIDifficulty) => void;
  onShuffleStack: () => void;
  onConfirmPlacement: () => void; // triggers AI placement + moves to reveal
  onNextRound: () => void;
  onRestart: () => void;
  canConfirm: boolean;     // true when all 3 player slots are filled
  canShuffle: boolean;     // false during reveal/resolution/gameover
}

// [BLOCK: Phase Label]
const PHASE_LABELS: Record<GamePhase, string> = {
  draw:       'Draw',
  placement:  'Place Cards',
  reveal:     'Revealing…',
  resolution: 'Round Over',
  gameover:   'Game Over',
};

// [BLOCK: Component]
export function HUD({
  round,
  phase,
  playerCardCount,
  aiCardCount,
  playerStackCount,
  aiStackCount,
  difficulty,
  onSetDifficulty,
  onShuffleStack,
  onConfirmPlacement,
  onNextRound,
  onRestart,
  canConfirm,
  canShuffle,
}: HUDProps) {
  return (
    <div className="hud">

      {/* [SUB-BLOCK: Round Counter] */}
      <div className="hud__round">
        <span className="hud__round-label">Round</span>
        <span className="hud__round-value">
          {Math.min(round, TOTAL_ROUNDS)} / {TOTAL_ROUNDS}
        </span>
        <span className={clsx('hud__phase-badge', `hud__phase-badge--${phase}`)}>
          {PHASE_LABELS[phase]}
        </span>
      </div>

      {/* [SUB-BLOCK: Card Counts] */}
      <div className="hud__counts">
        <div className="hud__count hud__count--player">
          <span className="hud__count-label">Your cards</span>
          <span className="hud__count-value">{playerCardCount}</span>
          <span className="hud__count-sub">Stack: {playerStackCount}</span>
        </div>
        <div className="hud__count-divider">vs</div>
        <div className="hud__count hud__count--ai">
          <span className="hud__count-label">Opponent</span>
          <span className="hud__count-value">{aiCardCount}</span>
          <span className="hud__count-sub">Stack: {aiStackCount}</span>
        </div>
      </div>

      {/* [SUB-BLOCK: Difficulty Selector] */}
      <div className="hud__difficulty">
        <span className="hud__difficulty-label">AI</span>
        <div className="hud__difficulty-btns">
          {(['random', 'smart'] as AIDifficulty[]).map((d) => (
            <button
              key={d}
              className={clsx('hud__diff-btn', difficulty === d && 'hud__diff-btn--active')}
              onClick={() => onSetDifficulty(d)}
              aria-pressed={difficulty === d}
            >
              {d.charAt(0).toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* [SUB-BLOCK: Actions] */}
      <div className="hud__actions">
        {/* Shuffle — available during draw and placement */}
        <button
          className="hud__action-btn hud__action-btn--shuffle"
          onClick={onShuffleStack}
          disabled={!canShuffle}
          title="Shuffle your stack — breaks Smart AI's pattern read"
        >
          ⇄ Shuffle Stack
        </button>

        {/* Confirm placement — only during placement when all 3 slots filled */}
        {phase === 'placement' && (
          <button
            className={clsx(
              'hud__action-btn hud__action-btn--confirm',
              canConfirm && 'hud__action-btn--ready',
            )}
            onClick={onConfirmPlacement}
            disabled={!canConfirm}
          >
            ✓ Confirm
          </button>
        )}

        {/* Next round — available after resolution */}
        {phase === 'resolution' && (
          <button
            className="hud__action-btn hud__action-btn--next"
            onClick={onNextRound}
          >
            Next Round →
          </button>
        )}

        {/* Restart — always available */}
        <button
          className="hud__action-btn hud__action-btn--restart"
          onClick={onRestart}
        >
          ↺ Restart
        </button>
      </div>

    </div>
  );
}

// [BLOCK: Styles]
export const hudStyles = `
  .hud {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 20px;
    background: #0d0d1a;
    border-radius: 12px;
    border: 1px solid #222;
  }

  /* Round */
  .hud__round {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .hud__round-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #555;
    font-weight: 600;
  }

  .hud__round-value {
    font-size: 20px;
    font-weight: 700;
    color: #ddd;
    font-variant-numeric: tabular-nums;
  }

  .hud__phase-badge {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 3px 8px;
    border-radius: 4px;
    background: #222;
    color: #888;
  }

  .hud__phase-badge--placement  { background: rgba(240,192,64,0.15); color: #f0c040; }
  .hud__phase-badge--reveal     { background: rgba(82,176,224,0.15); color: #52b0e0; }
  .hud__phase-badge--resolution { background: rgba(82,200,122,0.15); color: #52c87a; }
  .hud__phase-badge--gameover   { background: rgba(224,82,82,0.15);  color: #e05252; }

  /* Card counts */
  .hud__counts {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .hud__count {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .hud__count-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #555;
  }

  .hud__count-value {
    font-size: 22px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .hud__count-sub {
    font-size: 10px;
    color: #555;
  }

  .hud__count--player .hud__count-value { color: #52c87a; }
  .hud__count--ai     .hud__count-value { color: #e05252; }

  .hud__count-divider {
    font-size: 11px;
    font-weight: 700;
    color: #333;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  /* Difficulty */
  .hud__difficulty {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .hud__difficulty-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #555;
    font-weight: 600;
  }

  .hud__difficulty-btns {
    display: flex;
    gap: 4px;
  }

  .hud__diff-btn {
    padding: 4px 10px;
    border-radius: 6px;
    border: 1px solid #333;
    background: transparent;
    color: #666;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: border-color 0.15s, color 0.15s, background 0.15s;
  }

  .hud__diff-btn:hover {
    border-color: #555;
    color: #aaa;
  }

  .hud__diff-btn--active {
    border-color: #f0c040;
    color: #f0c040;
    background: rgba(240,192,64,0.08);
  }

  /* Actions */
  .hud__actions {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }

  .hud__action-btn {
    padding: 6px 14px;
    border-radius: 7px;
    border: 1px solid #333;
    background: transparent;
    color: #777;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: border-color 0.15s, color 0.15s, background 0.15s;
  }

  .hud__action-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .hud__action-btn:not(:disabled):hover {
    border-color: #555;
    color: #bbb;
  }

  .hud__action-btn--confirm {
    border-color: #444;
    color: #666;
  }

  .hud__action-btn--confirm.hud__action-btn--ready {
    border-color: #52c87a;
    color: #52c87a;
    background: rgba(82,200,122,0.08);
  }

  .hud__action-btn--next {
    border-color: #52b0e0;
    color: #52b0e0;
    background: rgba(82,176,224,0.08);
  }

  .hud__action-btn--restart {
    border-color: #333;
    color: #555;
    font-size: 11px;
  }
`;