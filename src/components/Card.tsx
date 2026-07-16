// src/components/Card.tsx

import type { Card as CardType } from '../types/game';
import clsx from 'clsx';
import styles from '../styles/Card.module.css';

// [BLOCK: Type Config]
// Visual label, symbol, and color class per card type.
// [Card Art] Sword/Arrow/Shield/Dragon all carry a full-bleed photo
// (`image`) now — when present and the card is face-up, the component
// renders the photo as the entire card background instead of the old
// symbol+label+color treatment, with only a small emoji badge (top-left)
// layered on top for at-a-glance type ID.
//
// [Card Art — Dragon] dragon.png is the same 600x900 source dimensions as
// the other three (see Card.module.css's 72x108 base size), so it uses
// the exact same rendering path as Sword/Arrow/Shield. The one difference:
// Dragon's colorClass is still applied ON TOP of the photo (see
// hasColorClass below) so its owner-aware gold/red border + glow survive
// underneath the image, instead of being replaced by the generic
// .card--photo frame the RPS types get. Dragon's colorClass itself is
// owner-dependent and resolved separately below, same as before this
// pass — only which cards get an `image` has changed.
//
// [Public Assets] These files live in /public (sword.png, arrow.png,
// shield.png, dragon.png) rather than /src/assets, so they're referenced
// by their served URL path (leading slash) instead of an ES import — Vite
// copies /public's contents to the output root as-is and never bundles
// them as modules, so `import ... from '../assets/...'` doesn't apply here.
const TYPE_CONFIG: Record<
  CardType['type'],
  { label: string; symbol: string; colorClass: string; image?: string }
> = {
  Sword:  { label: 'Sword',  symbol: '⚔️',  colorClass: 'card--sword',  image: '/sword.png' },
  Arrow:  { label: 'Arrow',  symbol: '🏹',  colorClass: 'card--arrow',  image: '/arrow.png' },
  Shield: { label: 'Shield', symbol: '🛡️', colorClass: 'card--shield', image: '/shield.png' },
  Dragon: { label: 'Dragon', symbol: '🐉',  colorClass: 'card--dragon-player', image: '/dragon.png' }, // colorClass fallback, overridden below
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
  // (same for every type, see .card--face-down). Every type now has an
  // `image`, so this is effectively just the faceDown gate at this point,
  // but the `!!config.image` check stays as a safety fallback in case a
  // type ever ships without art again.
  const hasImage = !faceDown && !!config.image;

  // Dragon's color depends on which side played it — gold for the player's
  // Dragon, red for the AI's. Every other type uses its fixed colorClass.
  const colorClass =
    card.type === 'Dragon'
      ? (card.owner === 'player' ? 'card--dragon-player' : 'card--dragon-ai')
      : config.colorClass;

  // [Card Art — Dragon] Unlike Sword/Arrow/Shield (whose colorClass is a
  // background-only fallback for when there's NO photo), Dragon's
  // colorClass carries its owner-aware border-color + glow, which should
  // stay visible even with the photo showing. So Dragon keeps its
  // colorClass applied whenever face-up, image or not — the other three
  // only get theirs when there's no image to show instead.
  const showColorClass = !faceDown && (!hasImage || card.type === 'Dragon');

  // [Card Art — Dragon] .card--photo governs generic photo-card border
  // treatment (a flat #555 border) — applied to Sword/Arrow/Shield's photo
  // cards, but deliberately skipped for Dragon so its own colorClass
  // border-color (gold/red) isn't overridden by the generic one.
  const showPhotoClass = hasImage && card.type !== 'Dragon';

  return (
    <div
      className={clsx(
        styles.card,
        showColorClass && styles[colorClass],
        showPhotoClass && styles['card--photo'],
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