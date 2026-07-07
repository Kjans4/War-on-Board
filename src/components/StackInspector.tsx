// src/components/StackInspector.tsx

import type { Card as CardType, Owner } from '../types/game';
import styles from '../styles/StackInspector.module.css';

// [BLOCK: Dev Test Mode — Phase 1: Stack Inspector]
// Read-only panel listing a stack's full contents, top to bottom (index 0
// is the top of the stack — the next card that would be drawn, per
// deck.ts's drawToFill, which slices from the front of the array). Shows
// type + exhausted flag per card. Opened by clicking either stack icon in
// Board.tsx while devMode is on — see Board.tsx's StackIcon onClick wiring.
// No editing here; that's Phase 3 (deferred) per dev-test-mode-plan.md.
// Dragon is included in TYPE_SYMBOL purely because Card['type'] allows it
// in the existing type system (see the standing Dragon/GDD conflict noted
// in dev-test-mode-plan.md) — it's not a deliberate Phase 1 addition, just
// exhaustive coverage of the type union so nothing renders blank.
interface StackInspectorProps {
  owner: Owner;
  stack: CardType[];
  onClose: () => void;
}

const TYPE_SYMBOL: Record<CardType['type'], string> = {
  Sword: '⚔️',
  Arrow: '🏹',
  Shield: '🛡️',
  Dragon: '🐉',
};

export function StackInspector({ owner, stack, onClose }: StackInspectorProps) {
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
            {stack.map((card, i) => (
              <li key={card.id} className={styles['stack-inspector__row']}>
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
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  );
}