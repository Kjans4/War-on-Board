// src/App.tsx

import { useEffect } from 'react';
import { useGameState } from './state/useGameState';
import { getAIPlacement } from './logic/ai';
import { Board, boardStyles } from './components/Board';
import { Hand, handStyles } from './components/Hand';
import { HUD, hudStyles } from './components/HUD';
import { cardStyles } from './components/Card';
import { slotStyles } from './components/Slot';
import type { AIDifficulty, Card as CardType, SlotKey } from './types/game';
import { SLOT_KEYS } from './types/game';

// [BLOCK: Combined Component Styles]
// Phase 1 prototype — each component ships its own template-string styles.
// Phase 4.1 replaces this with real design tokens / a proper stylesheet.
const combinedStyles = [
  cardStyles,
  slotStyles,
  boardStyles,
  handStyles,
  hudStyles,
].join('\n');

// [BLOCK: App Shell Styles]
const appStyles = `
  .app-shell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
    padding: 24px 16px 48px;
    max-width: 960px;
    margin: 0 auto;
  }

  .app-title {
    font-size: 28px;
    font-weight: 700;
    color: #eee;
    margin: 8px 0 0;
  }

  .app-gameover {
    text-align: center;
    padding: 24px;
  }

  .app-gameover h2 {
    color: #f0c040;
    margin: 0 0 8px;
  }

  .app-gameover p {
    color: #ccc;
    font-size: 16px;
  }
`;

function App() {
  const { state, dispatch } = useGameState('random');

  const {
    round,
    phase,
    playerStack,
    playerHand,
    playerSlots,
    aiStack,
    aiHand,
    aiSlots,
    ai,
    result,
  } = state;

  // [BLOCK: Auto-draw at round start]
  // Phase 1 has no separate "ready to draw" UI step — drawing happens
  // automatically the instant a round begins.
  useEffect(() => {
    if (phase === 'draw') {
      dispatch({ type: 'DRAW_CARDS' });
    }
  }, [phase, dispatch]);

  // [BLOCK: Auto-resolve once AI has placed]
  // PLACE_AI_CARDS moves phase -> 'reveal'. Phase 1 has no slot-by-slot
  // reveal animation yet (that's 4.5), so resolution fires immediately.
  useEffect(() => {
    if (phase === 'reveal') {
      dispatch({ type: 'REVEAL_ROUND' });
    }
  }, [phase, dispatch]);

  // [BLOCK: Derived values]
  const placedSlots: Partial<Record<SlotKey, CardType>> = {};
  for (const key of SLOT_KEYS) {
    const card = playerSlots[key].card;
    if (card) placedSlots[key] = card;
  }

  const canConfirm =
    phase === 'placement' &&
    SLOT_KEYS.every((k) => playerSlots[k].card !== null);

  const canShuffle = phase !== 'reveal' && phase !== 'gameover';

  const playerCardCount = playerStack.length + playerHand.length;
  const aiCardCount = aiStack.length + aiHand.length;

  // [BLOCK: Handlers]
  function handlePlaceCard(card: CardType, slotKey: SlotKey) {
    dispatch({ type: 'PLACE_CARD', slotKey, card });
  }

  function handleRemoveCard(slotKey: SlotKey) {
    dispatch({ type: 'REMOVE_CARD', slotKey });
  }

  function handleConfirmPlacement() {
    if (!canConfirm) return;
    // AI commits its 3 cards using the current difficulty's strategy.
    // Smart AI counter-logic lands in Phase 3 — getAIPlacement already
    // routes correctly, it just falls back to random until then.
    const placements = getAIPlacement(aiHand, ai);
    dispatch({ type: 'PLACE_AI_CARDS', placements });
  }

  function handleNextRound() {
    dispatch({ type: 'NEXT_ROUND' });
  }

  function handleShuffleStack() {
    dispatch({ type: 'SHUFFLE_STACK' });
  }

  function handleSetDifficulty(difficulty: AIDifficulty) {
    dispatch({ type: 'SET_DIFFICULTY', difficulty });
  }

  function handleRestart() {
    dispatch({ type: 'RESTART' });
  }

  // [BLOCK: Render]
  return (
    <>
      <style>{combinedStyles}</style>
      <style>{appStyles}</style>

      <div className="app-shell">
        <h1 className="app-title">War on Board</h1>

        <HUD
          round={round}
          phase={phase}
          playerCardCount={playerCardCount}
          aiCardCount={aiCardCount}
          playerStackCount={playerStack.length}
          aiStackCount={aiStack.length}
          difficulty={ai.difficulty}
          onSetDifficulty={handleSetDifficulty}
          onShuffleStack={handleShuffleStack}
          onConfirmPlacement={handleConfirmPlacement}
          onNextRound={handleNextRound}
          onRestart={handleRestart}
          canConfirm={canConfirm}
          canShuffle={canShuffle}
        />

        <Board
          playerSlots={playerSlots}
          aiSlots={aiSlots}
          revealingSlot={null}
        />

        {phase === 'gameover' ? (
          <div className="app-gameover">
            <h2>Game Over</h2>
            <p>
              {result === 'player' && 'You win!'}
              {result === 'ai' && 'The opponent wins.'}
              {result === 'draw' && "It's a draw."}
            </p>
          </div>
        ) : (
          <Hand
            hand={playerHand}
            placedSlots={placedSlots}
            onPlaceCard={handlePlaceCard}
            onRemoveCard={handleRemoveCard}
            disabled={phase !== 'placement'}
          />
        )}
      </div>
    </>
  );
}

export default App;