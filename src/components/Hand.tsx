// src/components/Hand.tsx

import type { CSSProperties } from 'react';
import type { Card as CardType } from '../types/game';
import { Card } from './Card';

// [BLOCK: Props]
// Phase 4 layout redesign: this component is now ONLY the fanned row of
// selectable cards. Placement targets used to live here as a duplicate
// row of slot buttons (see ROADMAP.md note on Board/Hand redundancy) —
// that row is gone. Placement now happens directly on the battlefield's
// player slots (see Board.tsx + Slot.tsx onClick).
interface HandProps {
  hand: CardType[];
  selectedCardId: string | null;
  onCardClick: (card: CardType) => void;
  disabled?: boolean; // true outside the placement phase
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

// [BLOCK: Component]
export function Hand({ hand, selectedCardId, onCardClick, disabled = false }: HandProps) {
  return (
    <div className="hand">
      <div className="hand__cards">
        {hand.map((card, i) => (
          <div key={card.id} className="hand__card-wrap" style={fanStyle(i, hand.length)}>
            <Card
              card={card}
              selected={selectedCardId === card.id}
              disabled={disabled}
              onClick={() => onCardClick(card)}
            />
          </div>
        ))}
        {hand.length === 0 && <p className="hand__empty">No cards in hand</p>}
      </div>
    </div>
  );
}

// [BLOCK: Styles]
export const handStyles = `
  .hand {
    display: flex;
    justify-content: center;
    padding: 4px 0 10px;
  }

  .hand__cards {
    display: flex;
    align-items: flex-end;
    justify-content: center;
    min-height: 100px;
  }

  .hand__card-wrap {
    position: relative;
    transition: transform 0.15s ease;
  }

  .hand__card-wrap:hover {
    transform: translateY(-10px) !important;
    z-index: 50 !important;
  }

  .hand__empty {
    color: #555;
    font-size: 13px;
    font-style: italic;
    margin: 0;
  }
`;