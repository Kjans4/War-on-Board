// src/components/Card.tsx

import type { Card as CardType } from '../types/game';
import clsx from 'clsx';

// [BLOCK: Type Config]
const TYPE_CONFIG: Record<CardType['type'], { label: string; symbol: string; colorClass: string }> = {
  Sword:  { label: 'Sword',  symbol: '⚔️',  colorClass: 'card--sword'  },
  Arrow:  { label: 'Arrow',  symbol: '🏹',  colorClass: 'card--arrow'  },
  Shield: { label: 'Shield', symbol: '🛡️', colorClass: 'card--shield' },
};

// [BLOCK: Props]
interface CardProps {
  card: CardType;
  faceDown?: boolean;       // toggling this now plays a real 3D flip
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

// [BLOCK: Component]
// Phase 4 reveal animation: real two-sided flip via a 3D-rotated inner
// wrapper with two stacked, backface-hidden faces. Toggling `faceDown`
// (e.g. placement -> reveal phase transitions) now animates instead of
// instantly swapping content — this is what makes the "flip down on Play,
// flip up on reveal" sequence in App.tsx actually visible.
export function Card({ card, faceDown = false, selected = false, disabled = false, onClick }: CardProps) {
  const config = TYPE_CONFIG[card.type];

  return (
    <div
      className={clsx(
        'card-flip',
        selected  && 'card-flip--selected',
        disabled  && 'card-flip--disabled',
        onClick && !disabled && 'card-flip--clickable',
      )}
      onClick={!disabled ? onClick : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick && !disabled ? 0 : undefined}
      onKeyDown={onClick && !disabled ? (e) => e.key === 'Enter' && onClick() : undefined}
      aria-label={faceDown ? 'Hidden card' : `${config.label}${card.exhausted ? ' (exhausted)' : ''}`}
    >
      <div className={clsx('card-flip__inner', faceDown && 'card-flip__inner--flipped')}>

        {/* Front face — face-up content */}
        <div className={clsx('card-face', 'card-face--front', config.colorClass, card.exhausted && 'card--exhausted')}>
          <span className="card__symbol" aria-hidden="true">{config.symbol}</span>
          <span className="card__label">{config.label}</span>
          {card.exhausted && (
            <span className="card__exhausted-badge" aria-hidden="true">E</span>
          )}
        </div>

        {/* Back face — face-down content */}
        <div className="card-face card-face--back">
          <span className="card__back-symbol">?</span>
        </div>

      </div>
    </div>
  );
}

// [BLOCK: Styles]
export const cardStyles = `
  .card-flip {
    width: 72px;
    height: 100px;
    position: relative;
    perspective: 800px;
    font-family: system-ui, sans-serif;
    color: #fff;
    user-select: none;
    transition: transform 0.15s ease;
  }

  .card-flip--clickable {
    cursor: pointer;
  }
  .card-flip--clickable:hover {
    transform: translateY(-4px);
  }

  .card-flip--selected {
    transform: translateY(-6px);
  }

  .card-flip--disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .card-flip__inner {
    position: relative;
    width: 100%;
    height: 100%;
    transform-style: preserve-3d;
    transition: transform 0.45s cubic-bezier(0.4, 0.1, 0.2, 1);
  }

  .card-flip__inner--flipped {
    transform: rotateY(180deg);
  }

  .card-face {
    position: absolute;
    inset: 0;
    backface-visibility: hidden;
    border-radius: 8px;
    border: 2px solid #444;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    background: #1a1a2e;
    box-shadow: 0 1px 0 rgba(0,0,0,0.4);
  }

  .card-flip--selected .card-face--front {
    border-color: #f0c040;
    box-shadow: 0 0 12px rgba(240,192,64,0.6);
  }

  /* Front face type colors */
  .card-face--front.card--sword  { border-color: #e05252; background: #2a1a1a; }
  .card-face--front.card--arrow  { border-color: #52b0e0; background: #1a2230; }
  .card-face--front.card--shield { border-color: #52c87a; background: #1a2a1e; }

  .card-face--front.card--exhausted {
    opacity: 0.75;
    border-style: dashed;
  }

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

  .card-face--back {
    background: #2a2a4a;
    border-color: #555;
    transform: rotateY(180deg);
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