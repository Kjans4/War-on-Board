// src/components/Card.tsx

import type { Card as CardType } from '../types/game';
import clsx from 'clsx';
import styles from '../styles/Card.module.css';

// [BLOCK: Type Config]
// Visual label, symbol, and color class per card type.
// [Card Art] Sword/Arrow/Shield now carry a full-bleed photo (`image`) —
// when present and the card is face-up, the component renders the photo
// as the entire card background instead of the old symbol+label+color
// treatment, with only a small emoji badge (top-left) layered on top for
// at-a-glance type ID. Dragon has no `image` yet and keeps the original
// symbol/label/colorClass rendering entirely unchanged — its colorClass
// is owner-dependent (see dragonOwnerClass logic below), resolved
// separately from this table same as before.
//
// [Public Assets] These files live in /public (sword.png, arrow.png,
// shield.png) rather than /src/assets, so they're referenced by their
// served URL path (leading slash) instead of an ES import — Vite copies
// /public's contents to the output root as-is and never bundles them as
// modules, so `import ... from '../assets/...'` doesn't apply here.
const TYPE_CONFIG: Record<
  CardType['type'],
  { label: string; symbol: string; colorClass: string; image?: string }
> = {
  Sword:  { label: 'Sword',  symbol: '⚔️',  colorClass: 'card--sword',  image: '/sword.png' },
  Arrow:  { label: 'Arrow',  symbol: '🏹',  colorClass: 'card--arrow',  image: '/arrow.png' },
  Shield: { label: 'Shield', symbol: '🛡️', colorClass: 'card--shield', image: '/shield.png' },
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

  // [Card Art] A card renders its photo only when face-up AND a photo
  // exists for its type — face-down always shows the generic back
  // (same for every type, see .card--face-down), and Dragon (no image
  // yet) always falls through to the original symbol/label rendering.
  const hasImage = !faceDown && !!config.image;

  // Dragon's color depends on which side played it — gold for the player's
  // Dragon, red for the AI's. Every other type uses its fixed colorClass.
  // Only actually applied as a background color when hasImage is false —
  // an image-backed card doesn't need the color wash underneath it.
  const colorClass =
    card.type === 'Dragon'
      ? (card.owner === 'player' ? 'card--dragon-player' : 'card--dragon-ai')
      : config.colorClass;

  return (
    <div
      className={clsx(
        styles.card,
        !faceDown && !hasImage && styles[colorClass],
        hasImage && styles['card--photo'],
        faceDown && styles['card--face-down'],
        card.exhausted && !faceDown && styles['card--exhausted'],
        selected && styles['card--selected'],
        disabled && styles['card--disabled'],
        onClick && !disabled && styles['card--clickable'],
      )}
      style={hasImage ? { backgroundImage: `url(${config.image})` } : undefined}
      onClick={!disabled ? onClick : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick && !disabled ? 0 : undefined}
      onKeyDown={onClick && !disabled ? (e) => e.key === 'Enter' && onClick() : undefined}
      aria-label={faceDown ? 'Hidden card' : `${config.label}${card.exhausted ? ' (exhausted)' : ''}`}
    >
      {faceDown ? (
        <span className={styles['card__back-symbol']}>?</span>
      ) : hasImage ? (
        <>
          {/* [Card Art] Small type-indicator badge, top-left — the only
              symbol overlay on an image-backed card. No text label here;
              the photo itself communicates the type. */}
          <span className={styles['card__type-badge']} aria-hidden="true">
            {config.symbol}
          </span>
          {card.exhausted && (
            <span className={styles['card__exhausted-badge']} aria-hidden="true">E</span>
          )}
        </>
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