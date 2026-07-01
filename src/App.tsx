// src/App.tsx

import { useEffect, useRef, useState } from 'react';
import { useGameState } from './state/useGameState';
import { getAIPlacement } from './logic/ai';
import { Board, boardStyles } from './components/Board';
import type { RevealStep } from './components/Board';
import { Hand, handStyles } from './components/Hand';
import { RoundCounter, PlayFooter, hudStyles } from './components/HUD';
import { RoundHistory, roundHistoryStyles } from './components/RoundHistory';
import { MainMenu, mainMenuStyles } from './components/MainMenu';
import { cardStyles } from './components/Card';
import { slotStyles } from './components/Slot';
import type { Card as CardType, SlotKey } from './types/game';
import { SLOT_KEYS } from './types/game';

// [BLOCK: Combined Component Styles]
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
    justify-content: flex-start;
    gap: 18px;
    padding: 36px 16px 16px;
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

// [BLOCK: Reveal Sequence Timings (ms)]
const FLIP_TO_LEFT_MS    = 2000; // suspense after flip before Left reveals
const LEFT_TO_CENTER_MS  = 1500; // gap between Left and Center
const CENTER_TO_RIGHT_MS = 1500; // gap between Center and Right
const RIGHT_TO_DONE_MS   = 800;  // brief hold after Right before Play lights up

function App() {
  const [started, setStarted] = useState(false);
  const { state, dispatch } = useGameState('random');
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [revealStep, setRevealStep] = useState<RevealStep>(null);

  // [BLOCK: Reveal Refs]
  // revealTimers: timer IDs so handleBackToMenu can clear them on hard exit.
  // revealFiredForRound: guards against double-firing the reveal effect when
  // React re-runs it after REVEAL_ROUND changes phase reveal→resolution.
  // The effect intentionally has NO cleanup return — timers must survive that
  // phase transition or they get cancelled before they can play.
  const revealTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const revealFiredForRound = useRef<number>(-1);

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

  // [BLOCK: Reveal Sequence]
  // Fires when phase enters 'reveal' (after AI cards are placed).
  // 1. Guard: only run once per round (ref prevents double-fire in StrictMode
  //    and after phase→resolution re-render).
  // 2. Dispatch REVEAL_ROUND immediately so reducer has final outcomes on slots.
  // 3. Start visual timer chain independently — NO cleanup return here so these
  //    timers aren't cancelled when phase changes to 'resolution' mid-sequence.
  useEffect(() => {
    if (!started || phase !== 'reveal') return;
    if (revealFiredForRound.current === round) return; // already running
    revealFiredForRound.current = round;

    // Resolve game state now (outcomes available for slotVisuals to read)
    dispatch({ type: 'REVEAL_ROUND' });

    // Start visual sequence
    setRevealStep('flipping');

    const t1 = setTimeout(() => setRevealStep('left'),
      FLIP_TO_LEFT_MS);
    const t2 = setTimeout(() => setRevealStep('center'),
      FLIP_TO_LEFT_MS + LEFT_TO_CENTER_MS);
    const t3 = setTimeout(() => setRevealStep('right'),
      FLIP_TO_LEFT_MS + LEFT_TO_CENTER_MS + CENTER_TO_RIGHT_MS);
    const t4 = setTimeout(() => setRevealStep('done'),
      FLIP_TO_LEFT_MS + LEFT_TO_CENTER_MS + CENTER_TO_RIGHT_MS + RIGHT_TO_DONE_MS);

    revealTimers.current = [t1, t2, t3, t4];

    // intentionally no cleanup return — timers must survive the
    // reveal → resolution phase transition or they'll be cancelled
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, phase, round]);

  // [BLOCK: Reset reveal step when a new round's placement begins]
  useEffect(() => {
    if (phase === 'placement') setRevealStep(null);
  }, [phase]);

  // [BLOCK: Clear card selection when leaving placement]
  useEffect(() => {
    if (phase !== 'placement') setSelectedCardId(null);
  }, [phase]);

  // [BLOCK: Derived values]
  const canConfirm =
    phase === 'placement' &&
    SLOT_KEYS.every((k) => playerSlots[k].card !== null);

  // Play only re-enables once the full visual sequence has finished
  const canAdvance = phase === 'resolution' && revealStep === 'done';
  const canShuffle = phase !== 'reveal' && phase !== 'gameover' && revealStep === null;
  const placementActive = phase === 'placement';

  const selectedCard = playerHand.find((c) => c.id === selectedCardId) ?? null;

  // [BLOCK: Handlers]
  function handleStartGame() { setStarted(true); }

  function handleBackToMenu() {
    revealTimers.current.forEach(clearTimeout);
    revealTimers.current = [];
    revealFiredForRound.current = -1;
    dispatch({ type: 'RESTART' });
    setSelectedCardId(null);
    setRevealStep(null);
    setStarted(false);
  }

  function handleCardClick(card: CardType) {
    if (phase !== 'placement') return;
    setSelectedCardId((prev) => (prev === card.id ? null : card.id));
  }

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
                revealStep={revealStep}
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