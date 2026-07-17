// src/components/CardPile.tsx

import clsx from 'clsx';
import type { Card as CardType } from '../types/game';
import { Card } from './Card';
import styles from '../styles/Board.module.css';

// [BLOCK: Real-Card Pile — shared by Stack + Discard]
// Replaces the old StackIcon/DiscardPile decorative boxes (46x64 /
// 40x56 gradient divs that never matched Card.module.css's actual
// 72x108 card size). This renders the real <Card> component, face-down,
// at native card size — so the deck and discard piles are visually real
// stacked cards, not placeholder icons, consistent with hand/board cards.
//
// PILE_BACK_CARD is a dummy — face-down rendering ignores type/owner
// entirely (see Card.tsx's hasImage/faceDown gating), so any valid Card
// shape works here. Using the real <Card> component (rather than a
// hand-rolled lookalike div) guarantees the pile's back visual stays in
// sync automatically if the card-back design ever changes.
const PILE_BACK_CARD: CardType = {
  id: 'pile-back',
  type: 'Sword',
  exhausted: false,
  owner: 'ai',
};

// [BLOCK: Depth Stack]
// count === 0 -> placeholder (empty recess, same footprint, no card).
// count === 1 -> single flat card, no depth layers.
// count >= 2 -> 1 ghost layer peeking behind.
// count >= 3 -> capped at 2 ghost layers regardless of how large the
//   actual pile is — a stack of 3 and a stack of 20 read identically
//   ("has depth"), so this never needs to scale with real count.
function depthLayerCount(count: number): number {
  if (count <= 0) return 0;
  return Math.min(count - 1, 2);
}

interface CardPileProps {
  count: number;
  label: string;
  variant: 'stack' | 'discard';
  elRef?: (el: HTMLDivElement | null) => void;
  onClick?: () => void;
  clickable?: boolean;
  // Optional override — default (`Inspect ${label}`) reads awkwardly for
  // some labels (e.g. "You"), so callers can supply a proper sentence.
  title?: string;
  // [Layout — Redundant Label Removal] Stack (deck) piles sit directly
  // above/below their own row's existing "Opponent"/"You" row label (see
  // Board.module.css's .battlefield__row-label / App's sidebar layout),
  // so a second identical caption under the pile itself just repeats
  // information already on screen — call sites for stack piles pass
  // showLabel={false}. Discard piles have no such sibling label anywhere
  // else on the board, so they keep theirs; defaults to true so discard
  // call sites don't need to opt in. The `label` value itself is still
  // used for aria/title text either way — only the visible caption is
  // suppressed, so accessibility is unaffected.
  showLabel?: boolean;
}

export function CardPile({
  count,
  label,
  variant,
  elRef,
  onClick,
  clickable = false,
  title,
  showLabel = true,
}: CardPileProps) {
  const depthLayers = depthLayerCount(count);
  const isEmpty = count === 0;

  return (
    <div
      className={clsx(
        styles['card-pile'],
        styles[`card-pile--${variant}`],
        isEmpty && styles['card-pile--empty'],
        clickable && styles['card-pile--clickable'],
      )}
      ref={elRef}
      onClick={clickable ? onClick : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => e.key === 'Enter' && onClick?.() : undefined}
      title={clickable ? title ?? `Inspect ${label}` : undefined}
      aria-label={!clickable ? label : undefined}
    >
      <span className={clsx(styles['card-pile__count'], styles[`card-pile__count--${variant}`])}>
        {count}
      </span>

      <div className={styles['card-pile__stack']}>
        {isEmpty ? (
          <div className={styles['card-pile__placeholder']} aria-hidden="true" />
        ) : (
          <>
            {Array.from({ length: depthLayers }).map((_, i) => (
              <div
                key={i}
                className={styles['card-pile__ghost']}
                style={{ transform: `translate(${(i + 1) * 3}px, ${(i + 1) * 3}px)` }}
                aria-hidden="true"
              />
            ))}
            <div className={styles['card-pile__top']}>
              <Card card={PILE_BACK_CARD} faceDown />
            </div>
          </>
        )}
      </div>

      {showLabel && (
        <span className={clsx(styles['card-pile__label'], styles[`card-pile__label--${variant}`])}>
          {label}
        </span>
      )}
    </div>
  );
}