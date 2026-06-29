// src/components/Hand.tsx

import type { Card as CardType, SlotKey } from '../types/game';
import { CARDS_TO_PLACE, SLOT_KEYS } from '../types/game';
import { Card } from './Card';
import clsx from 'clsx';
import { useState } from 'react';

// [BLOCK: Props]
interface HandProps {
  hand: CardType[];
  placedSlots: Partial<Record<SlotKey, CardType>>;  // which slots already have cards
  onPlaceCard: (card: CardType, slotKey: SlotKey) => void;
  onRemoveCard: (slotKey: SlotKey) => void;
  disabled?: boolean; // true during reveal/resolution phases
}

// [BLOCK: Component]
// Flat hand layout for Phase 1 — Phase 4 replaces with fanned arc.
// Two-step placement: click card to select, then click a slot button to place.
export function Hand({ hand, placedSlots, onPlaceCard, onRemoveCard, disabled = false }: HandProps) {
  const [selectedCard, setSelectedCard] = useState<CardType | null>(null);

  const placedCount = Object.keys(placedSlots).length;
  const canPlaceMore = placedCount < CARDS_TO_PLACE;

  function handleCardClick(card: CardType) {
    if (disabled) return;
    if (!canPlaceMore) return;
    setSelectedCard((prev) => (prev?.id === card.id ? null : card));
  }

  function handleSlotTarget(slotKey: SlotKey) {
    if (!selectedCard || disabled) return;
    if (placedSlots[slotKey]) return; // slot already occupied
    onPlaceCard(selectedCard, slotKey);
    setSelectedCard(null);
  }

  function handleRemove(slotKey: SlotKey) {
    if (disabled) return;
    onRemoveCard(slotKey);
  }

  return (
    <div className="hand">

      {/* [SUB-BLOCK: Slot Targets] */}
      <div className="hand__slot-targets">
        {SLOT_KEYS.map((key) => {
          const placed = placedSlots[key];
          return (
            <div key={key} className="hand__slot-target-group">
              <span className="hand__slot-label">{key}</span>

              {placed ? (
                // Show placed card with remove option
                <div className="hand__placed-card">
                  <Card card={placed} faceDown={false} />
                  {!disabled && (
                    <button
                      className="hand__remove-btn"
                      onClick={() => handleRemove(key)}
                      aria-label={`Remove ${placed.type} from ${key} slot`}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ) : (
                // Empty slot target
                <button
                  className={clsx(
                    'hand__slot-btn',
                    selectedCard && !disabled && 'hand__slot-btn--ready',
                  )}
                  onClick={() => handleSlotTarget(key)}
                  disabled={!selectedCard || disabled}
                  aria-label={`Place selected card in ${key} slot`}
                >
                  {selectedCard && !disabled ? `Place here` : `Empty`}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* [SUB-BLOCK: Cards in Hand] */}
      <div className="hand__cards">
        {hand.map((card) => (
          <Card
            key={card.id}
            card={card}
            selected={selectedCard?.id === card.id}
            disabled={disabled || (!canPlaceMore && selectedCard?.id !== card.id)}
            onClick={() => handleCardClick(card)}
          />
        ))}
        {hand.length === 0 && (
          <p className="hand__empty">No cards in hand</p>
        )}
      </div>

      {/* [SUB-BLOCK: Placement Status] */}
      <div className="hand__status">
        {disabled ? (
          <span className="hand__status-text">Waiting for resolution…</span>
        ) : (
          <span className="hand__status-text">
            {placedCount} / {CARDS_TO_PLACE} placed
            {selectedCard && ` — ${selectedCard.type} selected`}
          </span>
        )}
      </div>

    </div>
  );
}

// [BLOCK: Styles]
export const handStyles = `
  .hand {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding: 16px;
  }

  /* Slot targets row */
  .hand__slot-targets {
    display: flex;
    gap: 16px;
    justify-content: center;
  }

  .hand__slot-target-group {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }

  .hand__slot-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #888;
    font-weight: 600;
  }

  .hand__slot-btn {
    width: 72px;
    height: 100px;
    border-radius: 8px;
    border: 2px dashed #444;
    background: transparent;
    color: #666;
    font-size: 11px;
    cursor: not-allowed;
    transition: border-color 0.15s, color 0.15s;
  }

  .hand__slot-btn--ready {
    border-color: #f0c040;
    color: #f0c040;
    cursor: pointer;
  }
  .hand__slot-btn--ready:hover {
    background: rgba(240,192,64,0.08);
  }

  .hand__placed-card {
    position: relative;
  }

  .hand__remove-btn {
    position: absolute;
    top: -6px;
    right: -6px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: none;
    background: #e05252;
    color: #fff;
    font-size: 10px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    line-height: 1;
  }
  .hand__remove-btn:hover {
    background: #c03030;
  }

  /* Cards row */
  .hand__cards {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: center;
  }

  .hand__empty {
    color: #555;
    font-size: 13px;
    font-style: italic;
    margin: 0;
  }

  /* Status line */
  .hand__status {
    min-height: 20px;
  }

  .hand__status-text {
    font-size: 13px;
    color: #888;
  }
`;