// src/components/PlayerStackControls.tsx

import { useState } from 'react';
import clsx from 'clsx';
import type { Card as CardType, RPSType } from '../types/game';
import { CardPile } from './CardPile';
import { StackInspector } from './StackInspector';
// [Layout] Reuses Board.module.css's existing stack-col-wrap / card-pile /
// stack-col__shuffle classes rather than introducing a parallel CSS file —
// this is visually the exact same "card pile" widget Board.tsx already
// renders for the opponent, just relocated to sit beside <Hand> in
// App.tsx instead of inside the battlefield row (per design discussion:
// only the stack pile + Shuffle button move; Discard stays in Board).
import styles from '../styles/Board.module.css';

// [BLOCK: Props]
interface PlayerStackControlsProps {
  count: number;
  onShuffleStack: () => void;
  canShuffle: boolean;
  // [Dev Test Mode — Phase 1] Same convention as Board.tsx's stack piles —
  // only clickable (to open the Stack Inspector) while devMode is on.
  devMode?: boolean;
  playerStack: CardType[];
  // [Dev Test Mode — Phase 3] Matches Board.tsx's canEditStacks exactly —
  // see App.tsx, which passes the same canShuffle value to both.
  canEditStacks?: boolean;
  onSwapCard?: (cardId: string, newType: RPSType) => void;
  // Exposes the stack pile's DOM node up to App.tsx as 'stack-player' so
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
  // aiInspectorOpen exactly, just for this side, now that each stack pile
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
        {/* [Card Art] Real 72x108 face-down card pile via <CardPile>,
            replacing the old inline stack-col markup (which used the
            decorative 46x64 .stack-col__icon box) — see CardPile.tsx /
            Board.module.css's .card-pile block. */}
        <CardPile
          count={count}
          label="You"
          variant="stack"
          showLabel={false}
          elRef={(el) => registerRef?.('stack-player', el)}
          onClick={devMode ? handleStackClick : undefined}
          clickable={devMode}
          title="Inspect your stack"
        />

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