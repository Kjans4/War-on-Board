// src/components/Slot.tsx

import type { Slot as SlotType } from '../types/game';
import { Card } from './Card';
import clsx from 'clsx';

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
        'slot',
        `slot--${owner}`,
        displayOutcome?.className,
        isEmpty && 'slot--empty',
        interactive && 'slot--clickable',
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
        <div className="slot__placeholder" aria-hidden="true">
          {interactive && <span className="slot__hint">+</span>}
        </div>
      )}

      {displayOutcome && (
        <span className="slot__outcome-badge">{displayOutcome.label}</span>
      )}
    </div>
  );
}

// [BLOCK: Slot Styles]
export const slotStyles = `
  .slot {
    width: 76px;
    min-height: 104px;
    border-radius: 10px;
    border: 2px solid #333;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    position: relative;
    background: #111;
    transition: border-color 0.2s, box-shadow 0.2s, transform 0.15s;
    padding: 6px 0;
  }

  .slot--empty {
    border-style: dashed;
    border-color: #2a2a2a;
  }

  .slot__placeholder {
    width: 62px;
    height: 86px;
    border-radius: 8px;
    background: #1a1a1a;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .slot__hint {
    font-size: 22px;
    color: #444;
    font-weight: 300;
  }

  .slot--clickable {
    cursor: pointer;
  }
  .slot--clickable:hover {
    border-color: #f0c040;
    transform: translateY(-2px);
  }
  .slot--clickable:hover .slot__hint {
    color: #f0c040;
  }

  .slot--won       { border-color: #52c87a; box-shadow: 0 0 12px rgba(82,200,122,0.3); }
  .slot--lost      { border-color: #e05252; box-shadow: 0 0 12px rgba(224,82,82,0.3); }
  .slot--cascaded  { border-color: #9d6fe0; box-shadow: 0 0 12px rgba(157,111,224,0.3); }
  .slot--tied      { border-color: #e0a030; box-shadow: 0 0 12px rgba(224,160,48,0.3); }
  .slot--tied-lost { border-color: #666;    box-shadow: none; opacity: 0.6; }

  .slot__outcome-badge {
    position: absolute;
    bottom: -10px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 2px 6px;
    border-radius: 4px;
    white-space: nowrap;
  }

  .slot--won       .slot__outcome-badge { background: #52c87a; color: #0a1a10; }
  .slot--lost      .slot__outcome-badge { background: #e05252; color: #1a0a0a; }
  .slot--cascaded  .slot__outcome-badge { background: #9d6fe0; color: #1a0f2a; }
  .slot--tied      .slot__outcome-badge { background: #e0a030; color: #1a1000; }
  .slot--tied-lost .slot__outcome-badge { background: #444;    color: #aaa;    }
`;