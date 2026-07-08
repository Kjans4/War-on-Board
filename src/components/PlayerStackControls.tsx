// src/components/PlayerStackControls.tsx

import { useState } from 'react';
import clsx from 'clsx';
import type { Card as CardType, RPSType } from '../types/game';
import { StackInspector } from './StackInspector';
// [Layout] Reuses Board.module.css's existing stack-col/stack-col-wrap/
// stack-col__shuffle classes rather than introducing a parallel CSS file —
// this is visually the exact same "stack icon" widget Board.tsx already
// renders for the opponent, just relocated to sit beside <Hand> in
// App.tsx instead of inside the battlefield row (per design discussion:
// only the stack icon + Shuffle button move; Discard stays in Board).
import styles from '../styles/Board.module.css';

// [BLOCK: Props]
interface PlayerStackControlsProps {
  count: number;
  onShuffleStack: () => void;
  canShuffle: boolean;
  // [Dev Test Mode — Phase 1] Same convention as Board.tsx's stack icons —
  // only clickable (to open the Stack Inspector) while devMode is on.
  devMode?: boolean;
  playerStack: CardType[];
  // [Dev Test Mode — Phase 3] Matches Board.tsx's canEditStacks exactly —
  // see App.tsx, which passes the same canShuffle value to both.
  canEditStacks?: boolean;
  onSwapCard?: (cardId: string, newType: RPSType) => void;
  // Exposes the stack icon's DOM node up to App.tsx as 'stack-player' so
  // the return-flight animation can still measure it as a destination —
  // unchanged in meaning from when this lived inside Board.tsx.
  registerRef?: (key: string, el: HTMLElement | null) => void;
}

// [BLOCK: Component]
export function PlayerStackControls({
  count,
  onShuffleStack,
  canShuffle,
  devMode = false,
  playerStack,
  canEditStacks = false,
  onSwapCard,
  registerRef,
}: PlayerStackControlsProps) {
  // [Dev Test Mode — Phase 1: Stack Inspector]
  // Whether the player's own stack panel is open — mirrors Board.tsx's
  // aiInspectorOpen exactly, just for this side, now that each stack icon
  // owns its own inspector state independently (see Board.tsx's [Layout]
  // note on why the old shared Owner|null toggle was split in two).
  const [inspectorOpen, setInspectorOpen] = useState(false);

  function handleStackClick() {
    if (!devMode) return;
    setInspectorOpen((prev) => !prev);
  }

  return (
    <>
      <div className={clsx(styles['stack-col-wrap'], styles['stack-col-wrap--player'])}>
        <div
          className={clsx(styles['stack-col'], devMode && styles['stack-col--clickable'])}
          ref={(el) => registerRef?.('stack-player', el)}
          onClick={devMode ? handleStackClick : undefined}
          role={devMode ? 'button' : undefined}
          tabIndex={devMode ? 0 : undefined}
          onKeyDown={devMode ? (e) => e.key === 'Enter' && handleStackClick() : undefined}
          title={devMode ? 'Inspect your stack' : undefined}
        >
          <span className={styles['stack-col__count']}>{count}</span>
          <div className={styles['stack-col__icon']} aria-hidden="true" />
          <span className={styles['stack-col__label']}>You</span>
        </div>

        <button
          className={styles['stack-col__shuffle']}
          onClick={onShuffleStack}
          disabled={!canShuffle}
          title="Shuffle your stack — breaks Smart AI's pattern read"
        >
          ⇄ Shuffle
        </button>
      </div>

      {devMode && inspectorOpen && (
        <StackInspector
          owner="player"
          stack={playerStack}
          onClose={() => setInspectorOpen(false)}
          editable={canEditStacks}
          onSwapCard={onSwapCard}
        />
      )}
    </>
  );
}