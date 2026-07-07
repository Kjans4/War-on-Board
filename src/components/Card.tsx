// src/components/Card.tsx

import type { Card as CardType } from '../types/game';
import clsx from 'clsx';
import styles from '../styles/Card.module.css';

// [BLOCK: Type Config]
// Visual label and color class per card type.
// Dragon's colorClass is owner-dependent (see dragonOwnerClass below) —
// player Dragon reads gold, AI Dragon reads red, per design discussion —
// so this table's 'dragon' entry only supplies the label/symbol; the
// color class is resolved separately.
// colorClass values are keys into the CSS module (accessed via bracket
// notation below since the class names contain '--').
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
        styles.card,
        !faceDown && styles[colorClass],
        faceDown    && styles['card--face-down'],
        card.exhausted && !faceDown && styles['card--exhausted'],
        selected    && styles['card--selected'],
        disabled    && styles['card--disabled'],
        onClick     && !disabled && styles['card--clickable'],
      )}
      onClick={!disabled ? onClick : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick && !disabled ? 0 : undefined}
      onKeyDown={onClick && !disabled ? (e) => e.key === 'Enter' && onClick() : undefined}
      aria-label={faceDown ? 'Hidden card' : `${config.label}${card.exhausted ? ' (exhausted)' : ''}`}
    >
      {faceDown ? (
        <span className={styles['card__back-symbol']}>?</span>
      ) : (
        <>
          <span className={styles.card__symbol} aria-hidden="true">{config.symbol}</span>
          <span className={styles.card__label}>{config.label}</span>
          {card.exhausted && (
            <span className={styles['card__exhausted-badge']} aria-hidden="true">E</span>
          )}
        </>
      )}
    </div>
  );
}