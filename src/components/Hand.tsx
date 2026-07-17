// src/components/Hand.tsx

import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { Card as CardType, RPSType } from '../types/game';
import { HAND_SIZE } from '../types/game';
import { Card } from './Card';
import { CardTypePicker, CardEditButton } from './CardTypePicker';
import { getStackTypeCounts } from '../logic/deck';
import styles from '../styles/Hand.module.css';

// [BLOCK: Props]
// Phase 4 layout redesign: this component is now ONLY the fanned row of
// selectable cards. Placement targets used to live here as a duplicate
// row of slot buttons (see ROADMAP.md note on Board/Hand redundancy) —
// that row is gone. Placement now happens directly on the battlefield's
// player slots (see Board.tsx + Slot.tsx onClick).
//
// [Dev Test Mode — Phase 2] devMode/stack/onSwapCard are optional and only
// exercised when devMode is true — normal play never touches them. Editing
// reuses the same interactivity window as placement (disabled === true
// outside the placement phase), same as the rest of this component.
// onSwapCard's newType is RPSType (not the full CardType union) — Dragon
// is excluded from the swap picker per dev-test-mode-plan.md's standing
// conflict note, so this callback is never invoked with 'Dragon'.
interface HandProps {
  hand: CardType[];
  selectedCardId: string | null;
  onCardClick: (card: CardType) => void;
  disabled?: boolean; // true outside the placement phase
  devMode?: boolean;
  stack?: CardType[]; // the player's own stack — source for swap-in cards + counts
  onSwapCard?: (cardId: string, newType: RPSType) => void;
}

// [BLOCK: Fan Geometry]
// Computes a per-card rotation/offset so the hand reads as a fanned arc
// (Balatro-style) rather than a flat row.
function fanStyle(index: number, total: number): CSSProperties {
  if (total <= 1) return {};
  const mid = (total - 1) / 2;
  const offset = index - mid;
  const rotate = offset * 7;
  const translateY = Math.abs(offset) * 7;
  return {
    transform: `translateY(${translateY}px) rotate(${rotate}deg)`,
    transformOrigin: 'bottom center',
    marginLeft: index === 0 ? 0 : -18,
    zIndex: index,
  };
}

// [BLOCK: Fixed Fan Footprint — Layout Stability]
// FAN_CARD_WIDTH/FAN_OVERLAP mirror fanStyle's own numbers above (72px
// card width from Card.module.css, -18px marginLeft overlap) — kept as
// named constants here rather than re-deriving them, since they're only
// used for this width calculation, not the transform math itself.
//
// Previously .hand__cards had no explicit width — it sized itself to fit
// however many cards were actually in hand (justify-content: center just
// re-centers WITHIN that shrinking box). As cards got played over a round,
// the whole fan's bounding box shrank and re-centered itself smaller and
// smaller, which reads as the hand visually "closing up" / drifting
// inward rather than staying anchored in place. Locking .hand__cards to
// the WIDEST possible fan (a full HAND_SIZE-card hand) means the box
// itself never changes size — fewer cards just render centered within
// that same fixed-width box, so the hand's on-screen position stays
// constant regardless of how many cards remain.
const FAN_CARD_WIDTH = 72;
const FAN_OVERLAP = 18;
const MAX_FAN_WIDTH = FAN_CARD_WIDTH + (HAND_SIZE - 1) * (FAN_CARD_WIDTH - FAN_OVERLAP);

// [BLOCK: Component]
export function Hand({
  hand,
  selectedCardId,
  onCardClick,
  disabled = false,
  devMode = false,
  stack = [],
  onSwapCard,
}: HandProps) {
  // [Dev Test Mode — Phase 2] Which hand card (by id) currently has its
  // type picker open, if any. Local UI state only — never touches
  // GameState/reducer directly; the actual swap goes through onSwapCard.
  const [editingCardId, setEditingCardId] = useState<string | null>(null);

  const canEdit = devMode && !disabled && !!onSwapCard;
  const stackCounts = canEdit ? getStackTypeCounts(stack) : null;

  return (
    <div className={styles.hand}>
      <div className={styles.hand__cards} style={{ minWidth: MAX_FAN_WIDTH }}>
        {hand.map((card, i) => (
          <div
            key={card.id}
            className={styles['hand__card-wrap']}
            style={{ ...fanStyle(i, hand.length), position: 'relative' }}
          >
            <Card
              card={card}
              selected={selectedCardId === card.id}
              disabled={disabled}
              onClick={() => onCardClick(card)}
            />

            {canEdit && (
              <CardEditButton
                onClick={() =>
                  setEditingCardId((prev) => (prev === card.id ? null : card.id))
                }
              />
            )}

            {canEdit && editingCardId === card.id && stackCounts && (
              <CardTypePicker
                counts={stackCounts}
                onPick={(newType) => {
                  onSwapCard!(card.id, newType);
                  setEditingCardId(null);
                }}
                onClose={() => setEditingCardId(null)}
              />
            )}
          </div>
        ))}
        {hand.length === 0 && <p className={styles.hand__empty}>No cards in hand</p>}
      </div>
    </div>
  );
}