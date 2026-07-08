// src/components/Board.tsx

import { useState } from 'react';
import type { CSSProperties } from 'react';
import clsx from 'clsx';
import type { BoardSlots, SlotKey, Card as CardType, Owner, RPSType } from '../types/game';
import { SLOT_KEYS } from '../types/game';
import { Slot } from './Slot';
import { Card } from './Card';
import { StackInspector } from './StackInspector';
import { CardTypePicker, CardEditButton } from './CardTypePicker';
import { getStackTypeCounts } from '../logic/deck';
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
  // [Dev Test Mode — Phase 2] Swap an AI hand card (still unplaced) for a
  // different type, pulled from the AI's own stack — mirrors Hand.tsx's
  // onSwapCard for the player side. newType is RPSType only; Dragon is
  // excluded from the picker (see CardTypePicker.tsx). Optional/inert
  // outside devMode, same convention as onAiCardClick/onAiSlotClick above.
  onAiSwapCard?: (cardId: string, newType: RPSType) => void;
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
  // [Dev Test Mode — Phase 1: Stack Inspector / Phase 2: Hand Swap]
  // Full stack contents for both sides. Used by devMode's stack-icon click
  // (read-only inspector) AND as the source of per-type remaining counts
  // for the AI hand swap-picker (getStackTypeCounts(aiStack)). Not used
  // for anything visual otherwise — the stack icon itself still only ever
  // displays playerStackCount/aiStackCount.
  playerStack: CardType[];
  aiStack: CardType[];
  // [Dev Test Mode — Phase 3] Whether the Stack Inspector's per-row swap
  // picker is active. Confirmed scope: matches SHUFFLE_STACK's own window
  // exactly (any phase except 'reveal'/'gameover') — see App.tsx's
  // canShuffle, which this is passed the same value as.
  canEditStacks?: boolean;
  // Swaps a card sitting IN a stack (opened via the Stack Inspector) for a
  // different type, by exchanging its position with another card of that
  // type already in that SAME stack — see useGameState.ts's
  // DEV_SWAP_STACK_CARD. owner tells the caller which stack to dispatch
  // against, since a single inspector instance only ever shows one side
  // at a time but Board owns both.
  onStackSwapCard?: (owner: Owner, cardId: string, newType: RPSType) => void;
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
// [Dev Test Mode — Phase 1] onClick/clickable let App/Board open the Stack
// Inspector panel — only ever wired to be clickable when devMode is on
// (see Board's render below). Normal play never sets these, so the icon
// stays purely decorative/count-display outside dev mode, unchanged from
// before this phase.
function StackIcon({
  count,
  label,
  elRef,
  onClick,
  clickable = false,
}: {
  count: number;
  label: string;
  elRef?: (el: HTMLDivElement | null) => void;
  onClick?: () => void;
  clickable?: boolean;
}) {
  return (
    <div
      className={clsx(styles['stack-col'], clickable && styles['stack-col--clickable'])}
      ref={elRef}
      onClick={clickable ? onClick : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => e.key === 'Enter' && onClick?.() : undefined}
      title={clickable ? `Inspect ${label.toLowerCase()} stack` : undefined}
    >
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
  onAiSwapCard,
  playerStackCount,
  aiStackCount,
  playerDiscardCount,
  aiDiscardCount,
  onShuffleStack,
  canShuffle,
  dragonOverlayOwner,
  devMode = false,
  playerStack,
  aiStack,
  canEditStacks = false,
  onStackSwapCard,
  registerRef,
}: BoardProps) {
  // [Dev Test Mode — Phase 1: Stack Inspector]
  // Which side's stack panel is currently open, if any. Local UI state
  // only — mirrors CardTypePicker/Hand.tsx's editingCardId pattern (never
  // touches GameState/reducer; purely a display concern). Toggling the
  // same icon again closes it.
  const [inspectorOwner, setInspectorOwner] = useState<Owner | null>(null);

  function handleStackClick(owner: Owner) {
    if (!devMode) return;
    setInspectorOwner((prev) => (prev === owner ? null : owner));
  }

  // [Dev Test Mode — Phase 2: AI Hand Swap]
  // Which AI hand card (by id) currently has its type picker open, if
  // any — mirrors Hand.tsx's editingCardId for the player side exactly,
  // just kept here instead since the AI hand row lives in Board, not Hand.
  // Gated on placementActive rather than aiEditable/aiHasPlaced: editing an
  // unplaced hand card is independent of whether AI slots still have room
  // (per dev-test-mode-plan.md's "option B" — manual slot placement AND
  // the swap-picker both apply to AI hand cards simultaneously). A card
  // stops being editable the moment it's actually placed, since placing it
  // removes it from aiHand entirely — no extra guard needed for that.
  const [aiEditingCardId, setAiEditingCardId] = useState<string | null>(null);
  const canEditAiHand = devMode && placementActive && !!onAiSwapCard;
  const aiStackCounts = canEditAiHand ? getStackTypeCounts(aiStack) : null;

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
    <>
      <div className={styles['battlefield-row']}>

        {/* [SUB-BLOCK: Opponent Stack + Discard — left edge, floats toward opponent's row] */}
        <div className={clsx(styles['stack-col-wrap'], styles['stack-col-wrap--ai'])}>
          <StackIcon
            count={aiStackCount}
            label="Opponent"
            elRef={(el) => registerRef?.('stack-ai', el)}
            onClick={() => handleStackClick('ai')}
            clickable={devMode}
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
              exactly mirroring the player's own hand -> slot flow.
              [Dev Test Mode — Phase 2] canEditAiHand cards also get the ✎
              swap-picker, independent of aiEditable's slot-based gate. */}
          <div className={styles['battlefield__opp-hand']} aria-label={`Opponent hand: ${aiHand.length} cards`}>
            {aiHand.map((card, i) => (
              <div
                key={card.id}
                className={styles['battlefield__opp-card-wrap']}
                style={{ ...fanStyle(i, aiHand.length), position: 'relative' }}
              >
                <Card
                  card={card}
                  faceDown={!devMode}
                  selected={aiEditable && selectedAiCardId === card.id}
                  onClick={aiEditable ? () => onAiCardClick?.(card) : undefined}
                />

                {canEditAiHand && (
                  <CardEditButton
                    onClick={() =>
                      setAiEditingCardId((prev) => (prev === card.id ? null : card.id))
                    }
                  />
                )}

                {canEditAiHand && aiEditingCardId === card.id && aiStackCounts && (
                  <CardTypePicker
                    counts={aiStackCounts}
                    onPick={(newType) => {
                      onAiSwapCard!(card.id, newType);
                      setAiEditingCardId(null);
                    }}
                    onClose={() => setAiEditingCardId(null)}
                  />
                )}
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
            onClick={() => handleStackClick('player')}
            clickable={devMode}
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

      {/* [SUB-BLOCK: Dev Test Mode — Phase 1: Stack Inspector panel / Phase 3: editing] */}
      {devMode && inspectorOwner !== null && (
        <StackInspector
          owner={inspectorOwner}
          stack={inspectorOwner === 'player' ? playerStack : aiStack}
          onClose={() => setInspectorOwner(null)}
          editable={canEditStacks}
          onSwapCard={
            onStackSwapCard
              ? (cardId, newType) => onStackSwapCard(inspectorOwner, cardId, newType)
              : undefined
          }
        />
      )}
    </>
  );
}