// src/components/CardTypePicker.tsx

import type { CardType, RPSType } from '../types/game';
import styles from '../styles/CardTypePicker.module.css';

// [BLOCK: Dev Test Mode — Phase 2]
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
// closes it without needing an external click-outside listener.
//
// [Dev Test Mode — Phase 2] Dragon is deliberately excluded from TYPES —
// per dev-test-mode-plan.md's standing conflict note, this session leaves
// the Dragon/round-count mismatch untouched and doesn't extend Dragon into
// any new dev-tooling surface. `counts` still accepts the full CardType
// record (as returned by deck.ts's getStackTypeCounts) purely so callers
// don't need to reshape it — the Dragon entry within it is simply never
// read here.

const TYPES: RPSType[] = ['Sword', 'Arrow', 'Shield'];

const TYPE_SYMBOL: Record<RPSType, string> = {
  Sword: '⚔️',
  Arrow: '🏹',
  Shield: '🛡️',
};

interface CardTypePickerProps {
  counts: Record<CardType, number>;
  onPick: (type: RPSType) => void;
  onClose: () => void;
}

export function CardTypePicker({ counts, onPick, onClose }: CardTypePickerProps) {
  return (
    <>
      <div className={styles['type-picker-backdrop']} onClick={onClose} />
      <div className={styles['type-picker']} role="menu" onClick={(e) => e.stopPropagation()}>
        {TYPES.map((type) => {
          const remaining = counts[type];
          const disabled = remaining <= 0;
          return (
            <button
              key={type}
              className={styles['type-picker__option']}
              disabled={disabled}
              onClick={() => onPick(type)}
              role="menuitem"
            >
              <span className={styles['type-picker__symbol']} aria-hidden="true">{TYPE_SYMBOL[type]}</span>
              <span className={styles['type-picker__label']}>{type}</span>
              <span className={styles['type-picker__count']}>{remaining} left</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

// [BLOCK: Edit Affordance Button]
// Small "✎" control overlaid on a hand card's corner, shown only in dev
// mode. Kept as a separate exported piece (rather than baked into Hand/
// Board) so both callers render it identically.
export function CardEditButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className={styles['card-edit-btn']}
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