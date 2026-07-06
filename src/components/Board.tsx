// src/components/Board.tsx

import type { CSSProperties } from 'react';
import clsx from 'clsx';
import type { BoardSlots, SlotKey, Card as CardType, Owner } from '../types/game';
import { SLOT_KEYS } from '../types/game';
import { Slot } from './Slot';
import { Card } from './Card';

// [BLOCK: Reveal Step Type]
// Exported so App.tsx can type its local animation state.
// null        = not in reveal sequence (placement or post-resolution)
// flipping    = Play clicked, all cards flip face-down (2s pause before reveal starts)
// left        = left slot revealing
// center      = left + center revealed
// right       = all 3 slots revealed
// dragonOverlay = all 3 revealed, "Dragon Attack" banner showing (Dragon rounds only)
// done        = all revealed, outcome badges shown, awaiting Next Round
export type RevealStep = null | 'flipping' | 'left' | 'center' | 'right' | 'dragonOverlay' | 'done';

// [BLOCK: Per-slot visual state]
// Given the current reveal step, returns whether each slot should be shown
// face-down and whether its outcome badge/glow should be visible.
// This decouples "what the game state says" from "what's currently on screen"
// so the staggered reveal can show each slot individually while the reducer
// already has the final outcome for all three.
//
// 'dragonOverlay' is treated like being fully revealed (same as 'right'/
// 'done') but with outcome badges still withheld until 'done' — the banner
// plays over already-face-up cards, badges pop in only once it's done.
function slotVisuals(
  slotKey: SlotKey,
  revealStep: RevealStep,
  hasCard: boolean,
  hideDuringPlacement: boolean,
): { visuallyFaceDown: boolean; showOutcome: boolean } {
  if (revealStep === null) {
    // Pre-reveal — either mid-placement, or the brief gap between rounds.
    // The player always sees their own placement (hideDuringPlacement is
    // only ever true for the opponent's slots — see Board's call sites
    // below). The opponent's placed-but-unrevealed card stays hidden here
    // too: since the AI now places on its own ~2s timer independently of
    // when the player finishes (see App.tsx), without this its card would
    // flash face-up the instant that timer fires, well before the player
    // has even finished their own placement — breaking the whole
    // simultaneous-reveal/bluff premise the game is built on.
    return { visuallyFaceDown: hasCard && hideDuringPlacement, showOutcome: false };
  }

  if (!hasCard || revealStep === 'done' || revealStep === 'dragonOverlay') {
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
  playerDiscardCount: number;
  aiDiscardCount: number;
  onShuffleStack: () => void;
  canShuffle: boolean;
  // Set only when exactly one side played a Dragon this round — drives the
  // "Dragon Attack" banner. null the rest of the time (including
  // both-sides-Dragon rounds, which cancel rather than wipe).
  dragonOverlayOwner: Owner | null;
  // [Dev Test Mode — Phase 1] When true, the AI's hand renders face-up
  // instead of face-down. See dev-test-mode-plan.md. Does not affect any
  // combat/reveal logic — purely a visibility toggle over the opponent
  // hand row.
  devMode?: boolean;
  // Exposes DOM nodes for stack icons, discard piles, and slots up to
  // App.tsx by key (e.g. 'stack-player', 'discard-ai', 'slot-player-left')
  // so the return-flight animation can measure flight source/destination
  // rects. Purely a measurement hook — no visual effect on its own.
  registerRef?: (key: string, el: HTMLElement | null) => void;
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
function StackIcon({
  count,
  label,
  elRef,
}: {
  count: number;
  label: string;
  elRef?: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div className="stack-col" ref={elRef}>
      <span className="stack-col__count">{count}</span>
      <div className="stack-col__icon" aria-hidden="true" />
      <span className="stack-col__label">{label}</span>
    </div>
  );
}

// [BLOCK: Discard Pile]
// Visual home for cards that didn't survive the round — purely a display
// of GameState.playerDiscard/aiDiscard's length, plus a landing point for
// the return-flight animation (see App.tsx's buildReturnFlights).
function DiscardPile({
  count,
  elRef,
}: {
  count: number;
  elRef?: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div className="discard-col" ref={elRef}>
      <span className="discard-col__count">{count}</span>
      <div className="discard-col__icon" aria-hidden="true" />
      <span className="discard-col__label">Discard</span>
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
  playerDiscardCount,
  aiDiscardCount,
  onShuffleStack,
  canShuffle,
  dragonOverlayOwner,
  devMode = false,
  registerRef,
}: BoardProps) {
  // Overlay shows from the moment the timeline reaches 'dragonOverlay' and
  // lingers through 'done' (so it's still visible while outcome badges pop
  // in), then disappears once the round transitions and the caller resets
  // dragonOverlayOwner to null.
  const showDragonOverlay =
    dragonOverlayOwner !== null && (revealStep === 'dragonOverlay' || revealStep === 'done');

  return (
    <div className="battlefield-row">

      {/* [SUB-BLOCK: Opponent Stack + Discard — left edge, floats toward opponent's row] */}
      <div className="stack-col-wrap stack-col-wrap--ai">
        <StackIcon
          count={aiStackCount}
          label="Opponent"
          elRef={(el) => registerRef?.('stack-ai', el)}
        />
        <DiscardPile
          count={aiDiscardCount}
          elRef={(el) => registerRef?.('discard-ai', el)}
        />
      </div>

      {/* [SUB-BLOCK: Battlefield] */}
      <div className="battlefield">

        {/* Opponent hand — face-down normally; face-up in Dev Test Mode
            (Phase 1) so the person can see what the AI is holding before
            it places. */}
        <div className="battlefield__opp-hand" aria-label={`Opponent hand: ${aiHand.length} cards`}>
          {aiHand.map((card, i) => (
            <div key={card.id} className="battlefield__opp-card-wrap" style={fanStyle(i, aiHand.length)}>
              <Card card={card} faceDown={!devMode} />
            </div>
          ))}
        </div>

        {/* Opponent slots */}
        <div className="battlefield__row battlefield__row--ai">
          <span className="battlefield__row-label">Opponent</span>
          <div className="battlefield__slots">
            {SLOT_KEYS.map((key) => {
              const { visuallyFaceDown, showOutcome } = slotVisuals(key, revealStep, !!aiSlots[key].card, !devMode);
              return (
                <Slot
                  key={key}
                  slot={aiSlots[key]}
                  owner="ai"
                  visuallyFaceDown={visuallyFaceDown}
                  showOutcome={showOutcome}
                  elRef={(el) => registerRef?.(`slot-ai-${key}`, el)}
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
              const { visuallyFaceDown, showOutcome } = slotVisuals(key, revealStep, !!slot.card, false);
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
                  elRef={(el) => registerRef?.(`slot-player-${key}`, el)}
                />
              );
            })}
          </div>
          <span className="battlefield__row-label">You</span>
        </div>

        {/* [SUB-BLOCK: Dragon Attack overlay] */}
        {showDragonOverlay && (
          <div
            className={clsx(
              'dragon-overlay',
              dragonOverlayOwner === 'player' ? 'dragon-overlay--player' : 'dragon-overlay--ai',
            )}
            role="status"
          >
            <span className="dragon-overlay__text">Dragon Attack</span>
          </div>
        )}

      </div>

      {/* [SUB-BLOCK: Player Stack + Discard + Shuffle — right edge, floats toward player's row] */}
      <div className="stack-col-wrap stack-col-wrap--player">
        <StackIcon
          count={playerStackCount}
          label="You"
          elRef={(el) => registerRef?.('stack-player', el)}
        />
        <DiscardPile
          count={playerDiscardCount}
          elRef={(el) => registerRef?.('discard-player', el)}
        />
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
    position: relative;
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

  /* Discard pile column */
  .discard-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .discard-col__count {
    font-size: 16px;
    font-weight: 700;
    color: #998;
    font-variant-numeric: tabular-nums;
  }

  .discard-col__icon {
    width: 40px;
    height: 56px;
    border-radius: 6px;
    background: linear-gradient(135deg, #3a2a2a, #221515);
    border: 2px solid #4a3333;
    box-shadow: 2px 2px 0 #1a1010;
    opacity: 0.85;
  }

  .discard-col__label {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #665;
  }

  /* [BLOCK: Dragon Attack Overlay] */
  .dragon-overlay {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 100;
    padding: 14px 36px;
    border-radius: 10px;
    pointer-events: none;
    animation: dragon-overlay-pop 0.25s ease-out;
  }

  .dragon-overlay--player {
    background: rgba(42, 36, 16, 0.92);
    border: 2px solid #f0c040;
    box-shadow: 0 0 28px rgba(240,192,64,0.45);
  }

  .dragon-overlay--ai {
    background: rgba(42, 16, 16, 0.92);
    border: 2px solid #e05252;
    box-shadow: 0 0 28px rgba(224,82,82,0.45);
  }

  .dragon-overlay__text {
    font-size: 22px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .dragon-overlay--player .dragon-overlay__text { color: #f0c040; }
  .dragon-overlay--ai     .dragon-overlay__text { color: #e05252; }

  @keyframes dragon-overlay-pop {
    from { opacity: 0; transform: translate(-50%, -50%) scale(0.85); }
    to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  }
`;