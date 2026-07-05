// src/components/CardTypePicker.tsx

import type { CardType } from '../types/game';

// [BLOCK: Dev Test Mode — Phase 3]
// Shared popover used by both Hand.tsx (player hand) and Board.tsx (AI
// hand) to swap a hand card for a different type, pulled from that same
// owner's stack (see useGameState.ts's DEV_SWAP_HAND_CARD). Purely a
// presentation layer — the caller supplies remaining-count-per-type and
// handles the actual dispatch; this component doesn't know which owner
// it's editing.
//
// Positioning: expects to be rendered inside a `position: relative`
// wrapper around the card it's editing (see Hand.tsx / Board.tsx usage) —
// it absolutely-positions itself just below that wrapper. A transparent,
// full-viewport backdrop sits behind it so clicking anywhere outside
// closes the picker without needing an external click-outside listener.

const TYPES: CardType[] = ['Sword', 'Arrow', 'Shield', 'Dragon'];

const TYPE_SYMBOL: Record<CardType, string> = {
  Sword: '⚔️',
  Arrow: '🏹',
  Shield: '🛡️',
  Dragon: '🐉',
};

interface CardTypePickerProps {
  counts: Record<CardType, number>;
  onPick: (type: CardType) => void;
  onClose: () => void;
}

export function CardTypePicker({ counts, onPick, onClose }: CardTypePickerProps) {
  return (
    <>
      <div className="type-picker-backdrop" onClick={onClose} />
      <div className="type-picker" role="menu" onClick={(e) => e.stopPropagation()}>
        {TYPES.map((type) => {
          const remaining = counts[type];
          const disabled = remaining <= 0;
          return (
            <button
              key={type}
              className="type-picker__option"
              disabled={disabled}
              onClick={() => onPick(type)}
              role="menuitem"
            >
              <span className="type-picker__symbol" aria-hidden="true">{TYPE_SYMBOL[type]}</span>
              <span className="type-picker__label">{type}</span>
              <span className="type-picker__count">{remaining} left</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

// [BLOCK: Styles]
export const cardTypePickerStyles = `
  .type-picker-backdrop {
    position: fixed;
    inset: 0;
    z-index: 300;
    background: transparent;
  }

  .type-picker {
    position: absolute;
    top: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
    z-index: 301;
    display: flex;
    flex-direction: column;
    width: 150px;
    background: #14141f;
    border: 1px solid #333;
    border-radius: 8px;
    box-shadow: 0 10px 26px rgba(0,0,0,0.5);
    overflow: hidden;
    padding: 4px;
  }

  .type-picker__option {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border: none;
    border-radius: 5px;
    background: transparent;
    color: #ccc;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s;
  }

  .type-picker__option:not(:disabled):hover {
    background: rgba(240,192,64,0.1);
    color: #f0c040;
  }

  .type-picker__option:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .type-picker__symbol {
    font-size: 13px;
    flex-shrink: 0;
  }

  .type-picker__label {
    flex: 1;
  }

  .type-picker__count {
    font-size: 9px;
    color: #777;
    font-weight: 500;
    white-space: nowrap;
  }
`;

// [BLOCK: Edit Affordance Button]
// Small "✎" control overlaid on a hand card's corner, shown only in dev
// mode. Kept as a separate exported piece (rather than baked into Hand/
// Board) so both callers render it identically.
export function CardEditButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="card-edit-btn"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title="Change card type (Dev Test)"
      aria-label="Change card type"
    >
      ✎
    </button>
  );
}

export const cardEditButtonStyles = `
  .card-edit-btn {
    position: absolute;
    top: -6px;
    right: -6px;
    z-index: 10;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 1px solid #52b0e0;
    background: #14141f;
    color: #52b0e0;
    font-size: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }

  .card-edit-btn:hover {
    background: #52b0e0;
    color: #0d0d1a;
  }
`;