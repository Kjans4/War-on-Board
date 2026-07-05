// src/components/Board.tsx

import { useState } from 'react';
import type { CSSProperties } from 'react';
import clsx from 'clsx';
import type { BoardSlots, SlotKey, Card as CardType, CardType as CardTypeUnion, Owner } from '../types/game';
import { SLOT_KEYS } from '../types/game';
import { Slot } from './Slot';
import { Card } from './Card';
import { CardTypePicker, CardEditButton, cardTypePickerStyles, cardEditButtonStyles } from './CardTypePicker';
import { getStackTypeCounts } from '../logic/deck';

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
): { visuallyFaceDown: boolean; showOutcome: boolean } {
  if (!hasCard || revealStep === null || revealStep === 'done' || revealStep === 'dragonOverlay') {
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

// [BLOCK: Stack Inspector — Type Symbols]
// Same symbol set as Card.tsx's TYPE_CONFIG. Not imported from there since
// that map is keyed for full card rendering (colorClass etc.) and isn't
// exported — this is just the glyph, kept local to the inspector list.
const STACK_TYPE_SYMBOL: Record<CardType['type'], string> = {
  Sword: '⚔️',
  Arrow: '🏹',
  Shield: '🛡️',
  Dragon: '🐉',
};

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
  // Set only when exactly one side played a Dragon this round — drives the
  // "Dragon Attack" banner. null the rest of the time (including
  // both-sides-Dragon rounds, which cancel rather than wipe).
  dragonOverlayOwner: Owner | null;
  // [Dev Test Mode — Phase 1] When true, the AI's hand renders face-up
  // instead of face-down. See dev-test-mode-plan.md. Does not affect any
  // combat/reveal logic — purely a visibility toggle over the opponent
  // hand row.
  devMode?: boolean;
  // [Dev Test Mode — Phase 2] Full stack contents (top of stack = index 0,
  // per deck.ts's drawToFill/survivor-append order). Only ever displayed
  // when devMode is true, via the read-only stack inspector panel below.
  // Not used for anything else — counts above still drive the icon badge.
  playerStack: CardType[];
  aiStack: CardType[];
  // [Dev Test Mode — Phase 3] Swaps one of the AI's hand cards for a card
  // of the chosen type, pulled from the AI's own stack (never the
  // player's). Only wired up by the parent when devMode is true; the
  // button/picker below simply no-ops if this isn't provided.
  onSwapAiCard?: (cardId: string, newType: CardTypeUnion) => void;
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
// [Dev Test Mode — Phase 2] Gains an optional onClick, only wired up by the
// parent when devMode is true — the icon becomes a button into the stack
// inspector panel. Outside dev mode it renders exactly as before (inert).
function StackIcon({
  count,
  label,
  clickable = false,
  onClick,
}: {
  count: number;
  label: string;
  clickable?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      className={clsx('stack-col', clickable && 'stack-col--clickable')}
      onClick={clickable ? onClick : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => e.key === 'Enter' && onClick?.() : undefined}
      title={clickable ? `Inspect ${label} stack` : undefined}
    >
      <span className="stack-col__count">{count}</span>
      <div className="stack-col__icon" aria-hidden="true" />
      <span className="stack-col__label">{label}</span>
    </div>
  );
}

// [BLOCK: Stack Inspector Panel — Dev Test Mode Phase 2]
// Read-only. Lists a stack's cards top-to-bottom with type + exhausted
// flag. Does not dispatch anything — purely a view over props passed down
// from GameState. Closed via backdrop click or the ✕ button.
function StackInspectorPanel({
  label,
  cards,
  onClose,
}: {
  label: string;
  cards: CardType[];
  onClose: () => void;
}) {
  return (
    <div className="stack-inspector-backdrop" onClick={onClose}>
      <div
        className="stack-inspector"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`${label} stack contents`}
      >
        <div className="stack-inspector__header">
          <span>{label} Stack ({cards.length})</span>
          <button className="stack-inspector__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="stack-inspector__list">
          {cards.length === 0 ? (
            <p className="stack-inspector__empty">Stack is empty.</p>
          ) : (
            cards.map((card, i) => (
              <div key={card.id} className="stack-inspector__row">
                <span className="stack-inspector__pos">{i + 1}</span>
                <span className="stack-inspector__symbol" aria-hidden="true">
                  {STACK_TYPE_SYMBOL[card.type]}
                </span>
                <span className="stack-inspector__type">{card.type}</span>
                {card.exhausted && (
                  <span className="stack-inspector__exhausted">Exhausted</span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
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
  dragonOverlayOwner,
  devMode = false,
  playerStack,
  aiStack,
  onSwapAiCard,
}: BoardProps) {
  // [Dev Test Mode — Phase 2] Which stack's inspector panel is open, if
  // any. Local UI state only — never touches GameState/reducer.
  const [openStackPanel, setOpenStackPanel] = useState<Owner | null>(null);

  // [Dev Test Mode — Phase 3] Which AI hand card (by id) has its type
  // picker open, if any. Same pattern as Hand.tsx's editingCardId — local
  // UI state only, actual swap goes through onSwapAiCard.
  const [editingAiCardId, setEditingAiCardId] = useState<string | null>(null);

  // Overlay shows from the moment the timeline reaches 'dragonOverlay' and
  // lingers through 'done' (so it's still visible while outcome badges pop
  // in), then disappears once the round transitions and the caller resets
  // dragonOverlayOwner to null.
  const showDragonOverlay =
    dragonOverlayOwner !== null && (revealStep === 'dragonOverlay' || revealStep === 'done');

  // [Dev Test Mode — Phase 3] Editing only available during placement
  // (mirrors Hand.tsx's `disabled` gating) and only when the parent wired
  // up a swap handler.
  const canEditAiHand = devMode && placementActive && !!onSwapAiCard;
  const aiStackCounts = canEditAiHand ? getStackTypeCounts(aiStack) : null;

  return (
    <div className="battlefield-row">

      {/* [SUB-BLOCK: Opponent Stack — left edge, floats toward opponent's row] */}
      <div className="stack-col-wrap stack-col-wrap--ai">
        <StackIcon
          count={aiStackCount}
          label="Opponent"
          clickable={devMode}
          onClick={() => setOpenStackPanel('ai')}
        />
      </div>

      {/* [SUB-BLOCK: Battlefield] */}
      <div className="battlefield">

        {/* Opponent hand — face-down normally; face-up in Dev Test Mode
            (Phase 1) so the person can see what the AI is holding before
            it places. Phase 3 adds an edit button + type picker per card
            when devMode is on and we're still in placement. */}
        <div className="battlefield__opp-hand" aria-label={`Opponent hand: ${aiHand.length} cards`}>
          {aiHand.map((card, i) => (
            <div
              key={card.id}
              className="battlefield__opp-card-wrap"
              style={{ ...fanStyle(i, aiHand.length), position: 'relative' }}
            >
              <Card card={card} faceDown={!devMode} />

              {canEditAiHand && (
                <CardEditButton
                  onClick={() =>
                    setEditingAiCardId((prev) => (prev === card.id ? null : card.id))
                  }
                />
              )}

              {canEditAiHand && editingAiCardId === card.id && aiStackCounts && (
                <CardTypePicker
                  counts={aiStackCounts}
                  onPick={(newType) => {
                    onSwapAiCard!(card.id, newType);
                    setEditingAiCardId(null);
                  }}
                  onClose={() => setEditingAiCardId(null)}
                />
              )}
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

        {/* [SUB-BLOCK: Stack Inspector Panel — Dev Test Mode Phase 2] */}
        {devMode && openStackPanel && (
          <StackInspectorPanel
            label={openStackPanel === 'player' ? 'Your' : "Opponent's"}
            cards={openStackPanel === 'player' ? playerStack : aiStack}
            onClose={() => setOpenStackPanel(null)}
          />
        )}

      </div>

      {/* [SUB-BLOCK: Player Stack + Shuffle — right edge, floats toward player's row] */}
      <div className="stack-col-wrap stack-col-wrap--player">
        <StackIcon
          count={playerStackCount}
          label="You"
          clickable={devMode}
          onClick={() => setOpenStackPanel('player')}
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

  /* [Dev Test Mode — Phase 2] Clickable affordance on the stack icon,
     only applied when devMode is on (see StackIcon's clickable prop). */
  .stack-col--clickable {
    cursor: pointer;
    border-radius: 8px;
    transition: background 0.15s;
  }
  .stack-col--clickable:hover {
    background: rgba(82,176,224,0.08);
  }
  .stack-col--clickable:hover .stack-col__icon {
    border-color: #52b0e0;
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
    transition: border-color 0.15s;
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

  /* [BLOCK: Stack Inspector Panel — Dev Test Mode Phase 2] */
  .stack-inspector-backdrop {
    position: absolute;
    inset: 0;
    z-index: 200;
    background: rgba(0,0,0,0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
  }

  .stack-inspector {
    width: 240px;
    max-height: 360px;
    display: flex;
    flex-direction: column;
    background: #14141f;
    border: 1px solid #333;
    border-radius: 10px;
    box-shadow: 0 12px 32px rgba(0,0,0,0.5);
    overflow: hidden;
  }

  .stack-inspector__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #ccc;
    border-bottom: 1px solid #222;
    flex-shrink: 0;
  }

  .stack-inspector__close {
    border: none;
    background: transparent;
    color: #777;
    font-size: 13px;
    cursor: pointer;
    padding: 2px 6px;
    line-height: 1;
  }
  .stack-inspector__close:hover { color: #eee; }

  .stack-inspector__list {
    flex: 1;
    overflow-y: auto;
    padding: 4px;
  }

  .stack-inspector__empty {
    padding: 14px 12px;
    margin: 0;
    font-size: 12px;
    color: #555;
    font-style: italic;
    text-align: center;
  }

  .stack-inspector__row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 8px;
    border-radius: 5px;
    font-size: 12px;
  }

  .stack-inspector__row:nth-child(odd) {
    background: #191924;
  }

  .stack-inspector__pos {
    width: 18px;
    flex-shrink: 0;
    color: #555;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .stack-inspector__symbol {
    flex-shrink: 0;
  }

  .stack-inspector__type {
    flex: 1;
    color: #ccc;
    font-weight: 600;
  }

  .stack-inspector__exhausted {
    flex-shrink: 0;
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #f0a050;
    background: rgba(0,0,0,0.4);
    padding: 1px 5px;
    border-radius: 3px;
  }

  ${cardTypePickerStyles}
  ${cardEditButtonStyles}
`;