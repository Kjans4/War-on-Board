// src/components/Card.tsx

import type { Card as CardType } from '../types/game';
import clsx from 'clsx';

// [BLOCK: Type Config]
// Visual label and color class per card type.
// Dragon's colorClass is owner-dependent (see dragonOwnerClass below) —
// player Dragon reads gold, AI Dragon reads red, per design discussion —
// so this table's 'dragon' entry only supplies the label/symbol; the
// color class is resolved separately.
const TYPE_CONFIG: Record<CardType['type'], { label: string; symbol: string; colorClass: string }> = {
  Sword:  { label: 'Sword',  symbol: '⚔️',  colorClass: 'card--sword'  },
  Arrow:  { label: 'Arrow',  symbol: '🏹',  colorClass: 'card--arrow'  },
  Shield: { label: 'Shield', symbol: '🛡️', colorClass: 'card--shield' },
  Dragon: { label: 'Dragon', symbol: '🐉',  colorClass: 'card--dragon-player' }, // fallback, overridden below
};

// [BLOCK: Props]
interface CardProps {
  card: CardType;
  faceDown?: boolean;       // true when placed in a slot or in AI hand
  selected?: boolean;       // highlighted in hand before placement
  disabled?: boolean;       // not selectable (e.g. already placed 3 cards)
  onClick?: () => void;
}

// [BLOCK: Component]
export function Card({ card, faceDown = false, selected = false, disabled = false, onClick }: CardProps) {
  const config = TYPE_CONFIG[card.type];

  // Dragon's color depends on which side played it — gold for the player's
  // Dragon, red for the AI's. Every other type uses its fixed colorClass.
  const colorClass =
    card.type === 'Dragon'
      ? (card.owner === 'player' ? 'card--dragon-player' : 'card--dragon-ai')
      : config.colorClass;

  return (
    <div
      className={clsx(
        'card',
        !faceDown && colorClass,
        faceDown    && 'card--face-down',
        card.exhausted && !faceDown && 'card--exhausted',
        selected    && 'card--selected',
        disabled    && 'card--disabled',
        onClick     && !disabled && 'card--clickable',
      )}
      onClick={!disabled ? onClick : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick && !disabled ? 0 : undefined}
      onKeyDown={onClick && !disabled ? (e) => e.key === 'Enter' && onClick() : undefined}
      aria-label={faceDown ? 'Hidden card' : `${config.label}${card.exhausted ? ' (exhausted)' : ''}`}
    >
      {faceDown ? (
        <span className="card__back-symbol">?</span>
      ) : (
        <>
          <span className="card__symbol" aria-hidden="true">{config.symbol}</span>
          <span className="card__label">{config.label}</span>
          {card.exhausted && (
            <span className="card__exhausted-badge" aria-hidden="true">E</span>
          )}
        </>
      )}
    </div>
  );
}

// [BLOCK: Styles]
// Injected as a style tag — will be replaced by CSS file in Phase 4.
export const cardStyles = `
  .card {
    width: 72px;
    height: 100px;
    border-radius: 8px;
    border: 2px solid #444;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    position: relative;
    background: #1a1a2e;
    color: #fff;
    font-family: system-ui, sans-serif;
    user-select: none;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }

  .card--clickable {
    cursor: pointer;
  }
  .card--clickable:hover {
    transform: translateY(-4px);
    box-shadow: 0 6px 16px rgba(0,0,0,0.4);
  }

  .card--selected {
    border-color: #f0c040;
    box-shadow: 0 0 12px rgba(240,192,64,0.6);
    transform: translateY(-6px);
  }

  .card--disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .card--face-down {
    background: #2a2a4a;
    border-color: #555;
  }

  .card--exhausted {
    opacity: 0.75;
    border-style: dashed;
  }

  /* Type colors */
  .card--sword  { border-color: #e05252; background: #2a1a1a; }
  .card--arrow  { border-color: #52b0e0; background: #1a2230; }
  .card--shield { border-color: #52c87a; background: #1a2a1e; }

  /* Dragon — owner-aware coloring */
  .card--dragon-player { border-color: #f0c040; background: #2a2410; box-shadow: 0 0 10px rgba(240,192,64,0.25); }
  .card--dragon-ai     { border-color: #e05252; background: #2a1010; box-shadow: 0 0 10px rgba(224,82,82,0.25); }

  .card__symbol {
    font-size: 28px;
    line-height: 1;
  }

  .card__label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #ccc;
  }

  .card__back-symbol {
    font-size: 32px;
    color: #555;
    font-weight: 700;
  }

  .card__exhausted-badge {
    position: absolute;
    top: 4px;
    right: 4px;
    font-size: 9px;
    font-weight: 700;
    color: #f0a050;
    background: rgba(0,0,0,0.5);
    padding: 1px 3px;
    border-radius: 3px;
  }
`;