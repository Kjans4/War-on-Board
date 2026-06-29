// src/components/Slot.tsx

import type { Slot as SlotType } from '../types/game';
import { Card } from './Card';
import clsx from 'clsx';

// [BLOCK: Props]
interface SlotProps {
  slot: SlotType;
  owner: 'player' | 'ai';
  isRevealing?: boolean; // true during the reveal animation beat
}

// [BLOCK: Outcome Config]
const OUTCOME_CONFIG: Partial<Record<SlotType['state'], { label: string; className: string }>> = {
  won:       { label: 'Win',  className: 'slot--won'       },
  lost:      { label: 'Loss', className: 'slot--lost'      },
  tied:      { label: 'Tie',  className: 'slot--tied'      },
  'tied-lost': { label: 'Gone', className: 'slot--tied-lost' },
};

// [BLOCK: Component]
export function Slot({ slot, owner, isRevealing = false }: SlotProps) {
  const outcome = OUTCOME_CONFIG[slot.state];
  const isFaceDown = slot.state === 'placed';
  const isEmpty = slot.state === 'empty';

  return (
    <div
      className={clsx(
        'slot',
        `slot--${owner}`,
        outcome?.className,
        isRevealing && 'slot--revealing',
        isEmpty && 'slot--empty',
      )}
      aria-label={`${owner} ${slot.key} slot${outcome ? `: ${outcome.label}` : ''}`}
    >
      {slot.card ? (
        <Card card={slot.card} faceDown={isFaceDown} />
      ) : (
        <div className="slot__placeholder" aria-hidden="true" />
      )}

      {outcome && (
        <span className="slot__outcome-badge">{outcome.label}</span>
      )}
    </div>
  );
}

// [BLOCK: Slot Styles]
export const slotStyles = `
  .slot {
    width: 88px;
    min-height: 120px;
    border-radius: 10px;
    border: 2px solid #333;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    position: relative;
    background: #111;
    transition: border-color 0.2s, box-shadow 0.2s;
    padding: 8px 0;
  }

  .slot--empty {
    border-style: dashed;
    border-color: #2a2a2a;
  }

  .slot__placeholder {
    width: 72px;
    height: 100px;
    border-radius: 8px;
    background: #1a1a1a;
  }

  .slot--revealing {
    box-shadow: 0 0 20px rgba(240,192,64,0.4);
    border-color: #f0c040;
  }

  .slot--won       { border-color: #52c87a; box-shadow: 0 0 12px rgba(82,200,122,0.3); }
  .slot--lost      { border-color: #e05252; box-shadow: 0 0 12px rgba(224,82,82,0.3); }
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
  .slot--tied      .slot__outcome-badge { background: #e0a030; color: #1a1000; }
  .slot--tied-lost .slot__outcome-badge { background: #444;    color: #aaa;    }
`;