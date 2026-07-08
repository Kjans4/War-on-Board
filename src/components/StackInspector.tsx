// src/components/StackInspector.tsx

import { useState } from 'react';
import type { Card as CardType, Owner, RPSType } from '../types/game';
import { CardTypePicker, CardEditButton } from './CardTypePicker';
import { getStackTypeCounts } from '../logic/deck';
import styles from '../styles/StackInspector.module.css';

// [BLOCK: Dev Test Mode — Phase 1: Stack Inspector / Phase 3: Direct Stack Editing]
// Read-only panel listing a stack's full contents, top to bottom (index 0
// is the top of the stack — the next card that would be drawn, per
// deck.ts's drawToFill, which slices from the front of the array). Shows
// type + exhausted flag per card. Opened by clicking either stack icon in
// Board.tsx while devMode is on.
//
// [Phase 3] When `editable` is true, each row also gets the shared ✎
// swap-picker (same component Hand.tsx/Board.tsx use for hand cards) —
// picking a type here swaps this card's POSITION with another card of
// that type already in this SAME stack (see useGameState.ts's
// DEV_SWAP_STACK_CARD), never adding/removing/fabricating a card. Counts
// are computed via getStackTypeCounts(stack, excludeId: card.id) so the
// row being edited never counts itself as "available elsewhere."
// Dragon is included in TYPE_SYMBOL purely because Card['type'] allows it
// in the existing type system (see the standing Dragon/GDD conflict noted
// in dev-test-mode-plan.md) — not a deliberate addition here.
interface StackInspectorProps {
  owner: Owner;
  stack: CardType[];
  onClose: () => void;
  // [Phase 3] Gates whether the per-row ✎ button/picker renders at all.
  // Confirmed scope: matches SHUFFLE_STACK's own window (any phase except
  // 'reveal'/'gameover') — see App.tsx's canShuffle, passed through Board.
  editable?: boolean;
  onSwapCard?: (cardId: string, newType: RPSType) => void;
}

const TYPE_SYMBOL: Record<CardType['type'], string> = {
  Sword: '⚔️',
  Arrow: '🏹',
  Shield: '🛡️',
  Dragon: '🐉',
};

export function StackInspector({ owner, stack, onClose, editable = false, onSwapCard }: StackInspectorProps) {
  // [Phase 3] Which row (by card id) currently has its type picker open,
  // if any — mirrors Hand.tsx/Board.tsx's editingCardId pattern exactly.
  // Local UI state only; the actual swap goes through onSwapCard.
  const [editingCardId, setEditingCardId] = useState<string | null>(null);

  const canEdit = editable && !!onSwapCard;
  const label = owner === 'player' ? 'Your Stack' : 'Opponent Stack';

  return (
    <>
      <div className={styles['stack-inspector-backdrop']} onClick={onClose} />
      <div className={styles['stack-inspector']} role="dialog" aria-label={`${label} contents`}>
        <div className={styles['stack-inspector__header']}>
          <span className={styles['stack-inspector__title']}>
            {label} <span className={styles['stack-inspector__count']}>({stack.length})</span>
          </span>
          <button
            className={styles['stack-inspector__close']}
            onClick={onClose}
            aria-label="Close stack inspector"
          >
            ✕
          </button>
        </div>

        {stack.length === 0 ? (
          <p className={styles['stack-inspector__empty']}>Stack is empty.</p>
        ) : (
          <ol className={styles['stack-inspector__list']}>
            {stack.map((card, i) => {
              // Only computed per-row when actually editable — excludeId
              // ensures this card's own copy never counts as "available
              // elsewhere in the stack" (see deck.ts's doc comment on
              // getStackTypeCounts' excludeId param, added ahead of this
              // phase specifically for this use).
              const rowCounts = canEdit ? getStackTypeCounts(stack, card.id) : null;

              return (
                <li
                  key={card.id}
                  className={styles['stack-inspector__row']}
                  style={{ position: 'relative' }}
                >
                  <span className={styles['stack-inspector__position']}>
                    {i === 0 ? 'Top' : i + 1}
                  </span>
                  <span className={styles['stack-inspector__symbol']} aria-hidden="true">
                    {TYPE_SYMBOL[card.type]}
                  </span>
                  <span className={styles['stack-inspector__type']}>{card.type}</span>
                  {card.exhausted && (
                    <span className={styles['stack-inspector__exhausted']}>Exhausted</span>
                  )}

                  {canEdit && (
                    <CardEditButton
                      onClick={() =>
                        setEditingCardId((prev) => (prev === card.id ? null : card.id))
                      }
                    />
                  )}

                  {canEdit && editingCardId === card.id && rowCounts && (
                    <CardTypePicker
                      counts={rowCounts}
                      onPick={(newType) => {
                        onSwapCard!(card.id, newType);
                        setEditingCardId(null);
                      }}
                      onClose={() => setEditingCardId(null)}
                    />
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </>
  );
}