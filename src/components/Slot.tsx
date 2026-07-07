// src/components/Slot.tsx

import type { Slot as SlotType } from '../types/game';
import { Card } from './Card';
import clsx from 'clsx';
import styles from '../styles/Slot.module.css';

// [BLOCK: Props]
interface SlotProps {
  slot: SlotType;
  owner: 'player' | 'ai';
  onClick?: () => void;
  clickable?: boolean;
  // [Animation control]
  // These two decouple what's visually shown from what game state says —
  // needed for the staggered reveal sequence where state already has the
  // final outcome but each slot flips up one at a time.
  visuallyFaceDown?: boolean; // overrides the default face-down inference
  showOutcome?: boolean;      // gates the outcome badge + glow separately
  // Exposes this slot's DOM node to the parent (Board -> App) so the
  // discard/return flight animation can measure its position as a flight
  // source at round-end — see App.tsx's buildReturnFlights. Purely a
  // measurement hook; has no visual effect on its own.
  elRef?: (el: HTMLDivElement | null) => void;
}

// [BLOCK: Outcome Config]
// className values are keys into the CSS module (accessed via bracket
// notation below since the class names contain '--').
const OUTCOME_CONFIG: Partial<Record<SlotType['state'], { label: string; className: string }>> = {
  won:       { label: 'Win',      className: 'slot--won'      },
  lost:      { label: 'Loss',     className: 'slot--lost'     },
  cascaded:  { label: 'Cascaded', className: 'slot--cascaded' },
  tied:      { label: 'Tie',      className: 'slot--tied'     },
  'tied-lost': { label: 'Spent', className: 'slot--tied-lost' },
};

// [BLOCK: Component]
export function Slot({
  slot,
  owner,
  onClick,
  clickable = false,
  visuallyFaceDown,
  showOutcome,
  elRef,
}: SlotProps) {
  const outcome = OUTCOME_CONFIG[slot.state];
  const isEmpty = slot.state === 'empty';
  const interactive = clickable && !!onClick;

  // Default face-down logic: only when card is 'placed' (pre-reveal).
  // During placement phase we intentionally do NOT face cards down —
  // the player should see what they placed until they click Play.
  const isFaceDown = visuallyFaceDown !== undefined
    ? visuallyFaceDown
    : false; // placement-phase cards are always face-up; reveal animation drives face-down

  // Outcome glow/badge shows only when explicitly enabled (i.e. after
  // the reveal animation reaches this slot) or after resolution is complete.
  const displayOutcome = showOutcome ? outcome : undefined;

  return (
    <div
      ref={elRef}
      className={clsx(
        styles.slot,
        styles[`slot--${owner}`],
        displayOutcome?.className && styles[displayOutcome.className],
        isEmpty && styles['slot--empty'],
        interactive && styles['slot--clickable'],
      )}
      onClick={interactive ? onClick : undefined}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? (e) => e.key === 'Enter' && onClick?.() : undefined}
      aria-label={`${owner} ${slot.key} slot${displayOutcome ? `: ${displayOutcome.label}` : isEmpty ? ' (empty)' : ''}`}
    >
      {slot.card ? (
        <Card card={slot.card} faceDown={isFaceDown} />
      ) : (
        <div className={styles.slot__placeholder} aria-hidden="true">
          {interactive && <span className={styles.slot__hint}>+</span>}
        </div>
      )}

      {displayOutcome && (
        <span className={styles['slot__outcome-badge']}>{displayOutcome.label}</span>
      )}
    </div>
  );
}