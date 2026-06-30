// src/App.tsx

import { useEffect, useState } from 'react';
import { useGameState } from './state/useGameState';
import { getAIPlacement } from './logic/ai';
import { Board, boardStyles } from './components/Board';
import { Hand, handStyles } from './components/Hand';
import { RoundCounter, PlayFooter, hudStyles } from './components/HUD';
import { RoundHistory, roundHistoryStyles } from './components/RoundHistory';
import { MainMenu, mainMenuStyles } from './components/MainMenu';
import { cardStyles } from './components/Card';
import { slotStyles } from './components/Slot';
import type { Card as CardType, SlotKey } from './types/game';
import { SLOT_KEYS } from './types/game';

// [BLOCK: Combined Component Styles]
// Phase 1-3 prototype convention — each component ships its own
// template-string styles. Phase 4.1 (design tokens) will eventually
// replace this with a real stylesheet; not part of this layout pass.
const combinedStyles = [
  cardStyles,
  slotStyles,
  boardStyles,
  handStyles,
  hudStyles,
  roundHistoryStyles,
  mainMenuStyles,
].join('\n');

// [BLOCK: App Shell Styles]
// Phase 4 layout redesign: three-column, single-viewport layout.
// Left = sidebar (round counter, round history, Play button).
// Center = battlefield (Board) + player hand, flanked by stack columns.
// No scrolling at the page level — Round History scrolls internally.
const appStyles = `
  .app-shell {
    display: flex;
    flex: 1;
    min-height: 0;
    height: 100svh;
    width: 100%;
    box-sizing: border-box;
  }

  .app-sidebar {
    width: 200px;
    flex-shrink: 0;
    min-height: 0;
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: 20px 14px;
    border-right: 1px solid var(--border, #222);
    gap: 0;
    box-sizing: border-box;
  }

  .app-center {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 18px;
    padding: 16px;
  }

  .app-title {
    position: absolute;
    top: 14px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 18px;
    font-weight: 700;
    color: #555;
    margin: 0;
    letter-spacing: 0.04em;
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
  const [started, setStarted] = useState(false);
  const { state, dispatch } = useGameState('random');
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

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
    roundHistory,
  } = state;

  // [BLOCK: Auto-draw at round start]
  useEffect(() => {
    if (started && phase === 'draw') {
      dispatch({ type: 'DRAW_CARDS' });
    }
  }, [started, phase, dispatch]);

  // [BLOCK: Auto-resolve once AI has placed]
  useEffect(() => {
    if (started && phase === 'reveal') {
      dispatch({ type: 'REVEAL_ROUND' });
    }
  }, [started, phase, dispatch]);

  // [BLOCK: Clear card selection whenever placement phase ends]
  useEffect(() => {
    if (phase !== 'placement') setSelectedCardId(null);
  }, [phase]);

  // [BLOCK: Derived values]
  const canConfirm =
    phase === 'placement' &&
    SLOT_KEYS.every((k) => playerSlots[k].card !== null);

  const canAdvance = phase === 'resolution';
  const canShuffle = phase !== 'reveal' && phase !== 'gameover';
  const placementActive = phase === 'placement';

  const selectedCard = playerHand.find((c) => c.id === selectedCardId) ?? null;

  // [BLOCK: Handlers]
  function handleStartGame() {
    setStarted(true);
  }

  function handleBackToMenu() {
    dispatch({ type: 'RESTART' });
    setSelectedCardId(null);
    setStarted(false);
  }

  // Selecting/deselecting a card from hand
  function handleCardClick(card: CardType) {
    if (phase !== 'placement') return;
    setSelectedCardId((prev) => (prev === card.id ? null : card.id));
  }

  // Clicking a battlefield player slot — places the selected card, or
  // removes whatever's already there. This is the merged placement target
  // that used to be a separate row under Hand.
  function handleSlotClick(slotKey: SlotKey) {
    if (phase !== 'placement') return;
    const slot = playerSlots[slotKey];

    if (slot.card) {
      dispatch({ type: 'REMOVE_CARD', slotKey });
      return;
    }

    if (selectedCard) {
      dispatch({ type: 'PLACE_CARD', slotKey, card: selectedCard });
      setSelectedCardId(null);
    }
  }

  function handleConfirmPlacement() {
    if (!canConfirm) return;
    const placements = getAIPlacement(aiHand, ai, round);
    dispatch({ type: 'PLACE_AI_CARDS', placements });
  }

  function handleNextRound() {
    dispatch({ type: 'NEXT_ROUND' });
  }

  function handleShuffleStack() {
    dispatch({ type: 'SHUFFLE_STACK' });
  }

  // [BLOCK: Render — Main Menu]
  if (!started) {
    return (
      <>
        <style>{combinedStyles}</style>
        <style>{appStyles}</style>
        <div className="app-shell">
          <MainMenu onSelectRandom={handleStartGame} />
        </div>
      </>
    );
  }

  // [BLOCK: Render — Game]
  return (
    <>
      <style>{combinedStyles}</style>
      <style>{appStyles}</style>

      <h1 className="app-title">War on Board</h1>

      <div className="app-shell">

        {/* [SUB-BLOCK: Sidebar] */}
        <div className="app-sidebar">
          <RoundCounter round={round} />
          <RoundHistory history={roundHistory} />
          <PlayFooter
            phase={phase}
            onConfirmPlacement={handleConfirmPlacement}
            onNextRound={handleNextRound}
            onBackToMenu={handleBackToMenu}
            canConfirm={canConfirm}
            canAdvance={canAdvance}
          />
        </div>

        {/* [SUB-BLOCK: Center — Battlefield + Hand] */}
        <div className="app-center">
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
            <>
              <Board
                playerSlots={playerSlots}
                aiSlots={aiSlots}
                aiHand={aiHand}
                revealingSlot={null}
                selectedCardId={selectedCardId}
                onSlotClick={handleSlotClick}
                placementActive={placementActive}
                playerStackCount={playerStack.length}
                aiStackCount={aiStack.length}
                onShuffleStack={handleShuffleStack}
                canShuffle={canShuffle}
              />
              <Hand
                hand={playerHand}
                selectedCardId={selectedCardId}
                onCardClick={handleCardClick}
                disabled={phase !== 'placement'}
              />
            </>
          )}
        </div>

      </div>
    </>
  );
}

export default App;