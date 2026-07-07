// src/components/Board.tsx

import type { CSSProperties } from 'react';
import clsx from 'clsx';
import type { BoardSlots, SlotKey, Card as CardType, Owner } from '../types/game';
import { SLOT_KEYS } from '../types/game';
import { Slot } from './Slot';
import { Card } from './Card';
import styles from '../styles/Board.module.css';

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
  // [Dev Test Mode] Manual AI hand/slot editing — mirrors selectedCardId/
  // onSlotClick above, but for the AI's own side. Only meaningful (and
  // only wired to be clickable) while devMode is on and at least one AI
  // slot is still empty — see Board's internal aiEditable and App.tsx's
  // handleAiCardClick/handleAiSlotClick.
  selectedAiCardId?: string | null;
  onAiCardClick?: (card: CardType) => void;
  onAiSlotClick?: (slotKey: SlotKey) => void;
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
    <div className={styles['stack-col']} ref={elRef}>
      <span className={styles['stack-col__count']}>{count}</span>
      <div className={styles['stack-col__icon']} aria-hidden="true" />
      <span className={styles['stack-col__label']}>{label}</span>
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
    <div className={styles['discard-col']} ref={elRef}>
      <span className={styles['discard-col__count']}>{count}</span>
      <div className={styles['discard-col__icon']} aria-hidden="true" />
      <span className={styles['discard-col__label']}>Discard</span>
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
  selectedAiCardId = null,
  onAiCardClick,
  onAiSlotClick,
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

  // [Dev Test Mode] Manual AI editing window: only while devMode is on,
  // still in placement, and at least one AI slot is still empty. Once all
  // 3 are filled — whether by the tester's own clicks, the AI's timer, or
  // some mix — editing closes, matching the reducer's own PLACE_AI_CARD/
  // REMOVE_AI_CARD guards.
  const aiHasPlaced = SLOT_KEYS.every((k) => aiSlots[k].card !== null);
  const aiEditable = devMode && placementActive && !aiHasPlaced;

  return (
    <div className={styles['battlefield-row']}>

      {/* [SUB-BLOCK: Opponent Stack + Discard — left edge, floats toward opponent's row] */}
      <div className={clsx(styles['stack-col-wrap'], styles['stack-col-wrap--ai'])}>
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
      <div className={styles.battlefield}>

        {/* Opponent hand — face-down normally; face-up in Dev Test Mode
            (Phase 1) so the person can see what the AI is holding before
            it places. While aiEditable, cards are also selectable — click
            one, then click an empty opponent slot to place it there,
            exactly mirroring the player's own hand -> slot flow. */}
        <div className={styles['battlefield__opp-hand']} aria-label={`Opponent hand: ${aiHand.length} cards`}>
          {aiHand.map((card, i) => (
            <div key={card.id} className={styles['battlefield__opp-card-wrap']} style={fanStyle(i, aiHand.length)}>
              <Card
                card={card}
                faceDown={!devMode}
                selected={aiEditable && selectedAiCardId === card.id}
                onClick={aiEditable ? () => onAiCardClick?.(card) : undefined}
              />
            </div>
          ))}
        </div>

        {/* Opponent slots */}
        <div className={clsx(styles.battlefield__row, styles['battlefield__row--ai'])}>
          <span className={styles['battlefield__row-label']}>Opponent</span>
          <div className={styles.battlefield__slots}>
            {SLOT_KEYS.map((key) => {
              const { visuallyFaceDown, showOutcome } = slotVisuals(key, revealStep, !!aiSlots[key].card, !devMode);
              const aiSlot = aiSlots[key];
              const aiClickable = aiEditable && (aiSlot.card !== null || selectedAiCardId !== null);
              return (
                <Slot
                  key={key}
                  slot={aiSlot}
                  owner="ai"
                  visuallyFaceDown={visuallyFaceDown}
                  showOutcome={showOutcome}
                  onClick={() => onAiSlotClick?.(key)}
                  clickable={aiClickable}
                  elRef={(el) => registerRef?.(`slot-ai-${key}`, el)}
                />
              );
            })}
          </div>
        </div>

        {/* Divider */}
        <div className={styles.battlefield__divider} aria-hidden="true">
          <span className={styles['battlefield__divider-label']}>vs</span>
        </div>

        {/* Player slots */}
        <div className={clsx(styles.battlefield__row, styles['battlefield__row--player'])}>
          <div className={styles.battlefield__slots}>
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
          <span className={styles['battlefield__row-label']}>You</span>
        </div>

        {/* [SUB-BLOCK: Dragon Attack overlay] */}
        {showDragonOverlay && (
          <div
            className={clsx(
              styles['dragon-overlay'],
              dragonOverlayOwner === 'player' ? styles['dragon-overlay--player'] : styles['dragon-overlay--ai'],
            )}
            role="status"
          >
            <span className={styles['dragon-overlay__text']}>Dragon Attack</span>
          </div>
        )}

      </div>

      {/* [SUB-BLOCK: Player Stack + Discard + Shuffle — right edge, floats toward player's row] */}
      <div className={clsx(styles['stack-col-wrap'], styles['stack-col-wrap--player'])}>
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
          className={styles['stack-col__shuffle']}
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