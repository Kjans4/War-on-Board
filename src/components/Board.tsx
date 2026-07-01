// src/components/Board.tsx

import type { CSSProperties } from 'react';
import type { BoardSlots, SlotKey, Card as CardType } from '../types/game';
import { SLOT_KEYS } from '../types/game';
import { Slot } from './Slot';
import { Card } from './Card';

// [BLOCK: Reveal Step Type]
// Exported so App.tsx can type its local animation state.
// null     = not in reveal sequence (placement or post-resolution)
// flipping = Play clicked, all cards flip face-down (2s pause before left reveals)
// left     = left slot revealing
// center   = center slot revealing
// right    = right slot revealing
// done     = all revealed, awaiting Next Round
export type RevealStep = null | 'flipping' | 'left' | 'center' | 'right' | 'done';

// [BLOCK: Per-slot visual state]
// Given the current reveal step, returns whether each slot should be shown
// face-down and whether its outcome badge/glow should be visible.
// This decouples "what the game state says" from "what's currently on screen"
// so the staggered reveal can show each slot individually while the reducer
// already has the final outcome for all three.
function slotVisuals(
  slotKey: SlotKey,
  revealStep: RevealStep,
  hasCard: boolean,
): { visuallyFaceDown: boolean; showOutcome: boolean } {
  if (!hasCard || revealStep === null || revealStep === 'done') {
    return { visuallyFaceDown: false, showOutcome: revealStep === 'done' };
  }

  const ORDER: SlotKey[] = ['left', 'center', 'right'];
  const stepIndex: Record<string, number> = {
    flipping: -1, // nothing revealed yet
    left: 0,
    center: 1,
    right: 2,
  };

  const revealedUpTo = stepIndex[revealStep] ?? -1;
  const slotIndex = ORDER.indexOf(slotKey);

  const revealed = slotIndex <= revealedUpTo;
  return {
    visuallyFaceDown: !revealed,
    showOutcome: revealed,
  };
}

// [BLOCK: Props]
interface BoardProps {
  playerSlots: BoardSlots;
  aiSlots: BoardSlots;
  aiHand: CardType[];
  revealStep: RevealStep;
  selectedCardId: string | null;
  onSlotClick: (slotKey: SlotKey) => void;
  placementActive: boolean;
  playerStackCount: number;
  aiStackCount: number;
  onShuffleStack: () => void;
  canShuffle: boolean;
}

// [BLOCK: Opponent Hand Fan]
function fanStyle(index: number, total: number): CSSProperties {
  if (total <= 1) return {};
  const mid = (total - 1) / 2;
  const offset = index - mid;
  return {
    transform: `translateY(${Math.abs(offset) * 5}px) rotate(${offset * 6}deg)`,
    transformOrigin: 'top center',
    marginLeft: index === 0 ? 0 : -22,
    zIndex: total - index,
  };
}

// [BLOCK: Stack Icon]
function StackIcon({ count, label }: { count: number; label: string }) {
  return (
    <div className="stack-col">
      <span className="stack-col__count">{count}</span>
      <div className="stack-col__icon" aria-hidden="true" />
      <span className="stack-col__label">{label}</span>
    </div>
  );
}

// [BLOCK: Component]
export function Board({
  playerSlots,
  aiSlots,
  aiHand,
  revealStep,
  selectedCardId,
  onSlotClick,
  placementActive,
  playerStackCount,
  aiStackCount,
  onShuffleStack,
  canShuffle,
}: BoardProps) {
  return (
    <div className="battlefield-row">

      {/* [SUB-BLOCK: Opponent Stack — left edge, floats toward opponent's row] */}
      <div className="stack-col-wrap stack-col-wrap--ai">
        <StackIcon count={aiStackCount} label="Opponent" />
      </div>

      {/* [SUB-BLOCK: Battlefield] */}
      <div className="battlefield">

        {/* Opponent hand — always face-down */}
        <div className="battlefield__opp-hand" aria-label={`Opponent hand: ${aiHand.length} cards`}>
          {aiHand.map((card, i) => (
            <div key={card.id} className="battlefield__opp-card-wrap" style={fanStyle(i, aiHand.length)}>
              <Card card={card} faceDown />
            </div>
          ))}
        </div>

        {/* Opponent slots */}
        <div className="battlefield__row battlefield__row--ai">
          <span className="battlefield__row-label">Opponent</span>
          <div className="battlefield__slots">
            {SLOT_KEYS.map((key) => {
              const { visuallyFaceDown, showOutcome } = slotVisuals(key, revealStep, !!aiSlots[key].card);
              return (
                <Slot
                  key={key}
                  slot={aiSlots[key]}
                  owner="ai"
                  visuallyFaceDown={visuallyFaceDown}
                  showOutcome={showOutcome}
                />
              );
            })}
          </div>
        </div>

        {/* Divider */}
        <div className="battlefield__divider" aria-hidden="true">
          <span className="battlefield__divider-label">vs</span>
        </div>

        {/* Player slots */}
        <div className="battlefield__row battlefield__row--player">
          <div className="battlefield__slots">
            {SLOT_KEYS.map((key) => {
              const slot = playerSlots[key];
              const { visuallyFaceDown, showOutcome } = slotVisuals(key, revealStep, !!slot.card);
              const clickable = placementActive && (slot.card !== null || selectedCardId !== null);
              return (
                <Slot
                  key={key}
                  slot={slot}
                  owner="player"
                  visuallyFaceDown={visuallyFaceDown}
                  showOutcome={showOutcome}
                  onClick={() => onSlotClick(key)}
                  clickable={clickable}
                />
              );
            })}
          </div>
          <span className="battlefield__row-label">You</span>
        </div>

      </div>

      {/* [SUB-BLOCK: Player Stack + Shuffle — right edge, floats toward player's row] */}
      <div className="stack-col-wrap stack-col-wrap--player">
        <StackIcon count={playerStackCount} label="You" />
        <button
          className="stack-col__shuffle"
          onClick={onShuffleStack}
          disabled={!canShuffle}
          title="Shuffle your stack — breaks Smart AI's pattern read"
        >
          ⇄ Shuffle
        </button>
      </div>

    </div>
  );
}

// [BLOCK: Battlefield Styles]
export const boardStyles = `
  .battlefield-row {
    display: flex;
    align-items: stretch;
    justify-content: center;
    gap: 28px;
  }

  .battlefield {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }

  .battlefield__opp-hand {
    display: flex;
    align-items: flex-start;
    justify-content: center;
    min-height: 84px;
    margin-bottom: 2px;
  }

  .battlefield__opp-card-wrap {
    transform-origin: top center;
  }

  .battlefield__row {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }

  .battlefield__row-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-weight: 600;
    color: #555;
  }

  .battlefield__row--player .battlefield__row-label { color: #6a9; }
  .battlefield__row--ai     .battlefield__row-label { color: #a66; }

  .battlefield__slots {
    display: flex;
    gap: 12px;
  }

  .battlefield__divider {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 4px;
  }

  .battlefield__divider::before,
  .battlefield__divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: #222;
  }

  .battlefield__divider-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #333;
    font-weight: 700;
  }

  /* Stack columns */
  .stack-col-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }

  .stack-col-wrap--ai     { align-self: flex-start; margin-top: 4px; }
  .stack-col-wrap--player { align-self: flex-end;   margin-bottom: 4px; }

  .stack-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .stack-col__count {
    font-size: 20px;
    font-weight: 700;
    color: #ddd;
    font-variant-numeric: tabular-nums;
  }

  .stack-col__icon {
    width: 46px;
    height: 64px;
    border-radius: 6px;
    background: linear-gradient(135deg, #2a2a4a, #1a1a2e);
    border: 2px solid #444;
    box-shadow: 2px 2px 0 #161622, 4px 4px 0 #111;
  }

  .stack-col__label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #555;
  }

  .stack-col__shuffle {
    padding: 6px 12px;
    border-radius: 7px;
    border: 1px solid #333;
    background: transparent;
    color: #777;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: border-color 0.15s, color 0.15s;
    white-space: nowrap;
  }

  .stack-col__shuffle:disabled { opacity: 0.35; cursor: not-allowed; }
  .stack-col__shuffle:not(:disabled):hover { border-color: #555; color: #bbb; }
`;