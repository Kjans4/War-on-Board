// src/App.tsx

import { useEffect, useRef, useState } from 'react';
import { useGameState } from './state/useGameState';
import { getAIPlacement } from './logic/ai';
import { findDragonPlacement } from './logic/combat';
import { Board, boardStyles } from './components/Board';
import type { RevealStep } from './components/Board';
import { Hand, handStyles } from './components/Hand';
import { RoundCounter, PlayFooter, hudStyles } from './components/HUD';
import { RoundHistory, roundHistoryStyles } from './components/RoundHistory';
import { MainMenu, mainMenuStyles } from './components/MainMenu';
import { cardStyles } from './components/Card';
import { slotStyles } from './components/Slot';
import type { Card as CardType, CardType as CardTypeUnion, SlotKey, Owner } from './types/game';
import { SLOT_KEYS } from './types/game';

// [BLOCK: Combined Component Styles]
const combinedStyles = [
  cardStyles, slotStyles, boardStyles, handStyles,
  hudStyles, roundHistoryStyles, mainMenuStyles,
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

  /* [BLOCK: Dev Mode Badge] */
  .app-dev-badge {
    position: absolute;
    top: 14px;
    right: 16px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #52b0e0;
    border: 1px solid #52b0e0;
    border-radius: 6px;
    padding: 3px 8px;
  }
`;

// [BLOCK: Reveal + Auto-Transition Timings (ms)]
const FLIP_TO_LEFT_MS    = 2000;
const LEFT_TO_CENTER_MS  = 1500;
const CENTER_TO_RIGHT_MS = 1500;
const RIGHT_TO_DONE_MS   = 800;
const DONE_TO_HISTORY_MS = 500;
const HISTORY_TO_NEXT_MS = 1500;

const DRAGON_OVERLAY_DELAY_MS = 500;
const DRAGON_OVERLAY_HOLD_MS = 1400;

// [BLOCK: Reveal Timeline Builder]
interface StepEvent {
  step: RevealStep;
  at: number;
}

function buildRevealTimeline(dragonSlotIndex: number | null): { events: StepEvent[]; doneAt: number } {
  if (dragonSlotIndex === null) {
    const leftAt = FLIP_TO_LEFT_MS;
    const centerAt = leftAt + LEFT_TO_CENTER_MS;
    const rightAt = centerAt + CENTER_TO_RIGHT_MS;
    const doneAt = rightAt + RIGHT_TO_DONE_MS;
    return {
      events: [
        { step: 'left', at: leftAt },
        { step: 'center', at: centerAt },
        { step: 'right', at: rightAt },
        { step: 'done', at: doneAt },
      ],
      doneAt,
    };
  }

  const events: StepEvent[] = [];
  let t = FLIP_TO_LEFT_MS;

  if (dragonSlotIndex === 0) {
    events.push({ step: 'right', at: t });
  } else if (dragonSlotIndex === 1) {
    events.push({ step: 'left', at: t });
    t += LEFT_TO_CENTER_MS;
    events.push({ step: 'right', at: t });
  } else {
    events.push({ step: 'left', at: t });
    t += LEFT_TO_CENTER_MS;
    events.push({ step: 'center', at: t });
    t += CENTER_TO_RIGHT_MS;
    events.push({ step: 'right', at: t });
  }

  const overlayAt = t + DRAGON_OVERLAY_DELAY_MS;
  const doneAt = overlayAt + DRAGON_OVERLAY_HOLD_MS;

  events.push({ step: 'dragonOverlay', at: overlayAt });
  events.push({ step: 'done', at: doneAt });

  return { events, doneAt };
}

function App() {
  const [started, setStarted] = useState(false);
  const { state, dispatch } = useGameState('random');
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [revealStep, setRevealStep] = useState<RevealStep>(null);
  const [dragonOverlayOwner, setDragonOverlayOwner] = useState<Owner | null>(null);

  const allTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const revealFiredForRound = useRef<number>(-1);
  const historyRecordedForRound = useRef<number>(-1);

  const {
    round, phase,
    playerStack, playerHand, playerSlots,
    aiStack, aiHand, aiSlots,
    ai, result, roundHistory,
    devMode,
  } = state;

  useEffect(() => {
    if (started && phase === 'draw') dispatch({ type: 'DRAW_CARDS' });
  }, [started, phase, dispatch]);

  useEffect(() => {
    if (!started || phase !== 'reveal') return;
    if (revealFiredForRound.current === round) return;
    revealFiredForRound.current = round;

    const dragonPlacement = findDragonPlacement(playerSlots, aiSlots);
    const dragonSlotIndex = dragonPlacement ? SLOT_KEYS.indexOf(dragonPlacement.slotKey) : null;
    setDragonOverlayOwner(dragonPlacement?.owner ?? null);

    dispatch({ type: 'REVEAL_ROUND' });
    setRevealStep('flipping');

    const { events, doneAt } = buildRevealTimeline(dragonSlotIndex);

    const stepTimers = events.map((e) =>
      setTimeout(() => setRevealStep(e.step), e.at)
    );

    const historyTimer = setTimeout(() => {
      historyRecordedForRound.current = round;
      dispatch({ type: 'RECORD_HISTORY' });
    }, doneAt + DONE_TO_HISTORY_MS);

    const nextRoundTimer = setTimeout(() => {
      dispatch({ type: 'NEXT_ROUND' });
      setRevealStep(null);
      setDragonOverlayOwner(null);
    }, doneAt + DONE_TO_HISTORY_MS + HISTORY_TO_NEXT_MS);

    allTimers.current = [...stepTimers, historyTimer, nextRoundTimer];

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, phase, round]);

  useEffect(() => {
    if (phase === 'placement') setRevealStep(null);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'placement') setSelectedCardId(null);
  }, [phase]);

  const canConfirm =
    phase === 'placement' &&
    SLOT_KEYS.every((k) => playerSlots[k].card !== null);

  const canSkip = revealStep !== null && phase === 'resolution';

  const canShuffle = phase !== 'reveal' && phase !== 'gameover' && revealStep === null;
  const placementActive = phase === 'placement';
  const selectedCard = playerHand.find((c) => c.id === selectedCardId) ?? null;

  function handleStartGame(devModeOn: boolean) {
    dispatch({ type: 'SET_DEV_MODE', devMode: devModeOn });
    setStarted(true);
  }

  function handleBackToMenu() {
    allTimers.current.forEach(clearTimeout);
    allTimers.current = [];
    revealFiredForRound.current = -1;
    historyRecordedForRound.current = -1;
    dispatch({ type: 'RESTART' });
    setSelectedCardId(null);
    setRevealStep(null);
    setDragonOverlayOwner(null);
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

  function handleSkip() {
    if (!canSkip) return;
    allTimers.current.forEach(clearTimeout);
    allTimers.current = [];
    if (historyRecordedForRound.current !== round) {
      historyRecordedForRound.current = round;
      dispatch({ type: 'RECORD_HISTORY' });
    }
    dispatch({ type: 'NEXT_ROUND' });
    setRevealStep(null);
    setDragonOverlayOwner(null);
  }

  function handleShuffleStack() {
    dispatch({ type: 'SHUFFLE_STACK' });
  }

  // [BLOCK: Dev Test Mode — Phase 3]
  // Single entry point for both hands' swap actions — owner distinguishes
  // which side's hand/stack the reducer touches. See useGameState.ts's
  // DEV_SWAP_HAND_CARD (no-ops if devMode is off, defensively).
  function handleDevSwapCard(owner: Owner, cardId: string, newType: CardTypeUnion) {
    dispatch({ type: 'DEV_SWAP_HAND_CARD', owner, cardId, newType });
  }

  // [Dev Test Mode — Phase 4] Swaps two cards' positions within one
  // owner's stack, from inside the stack inspector panel. See
  // useGameState.ts's DEV_SWAP_STACK_CARD.
  function handleDevSwapStackCard(owner: Owner, cardId: string, newType: CardTypeUnion) {
    dispatch({ type: 'DEV_SWAP_STACK_CARD', owner, cardId, newType });
  }

  if (!started) {
    return (
      <>
        <style>{combinedStyles}</style>
        <style>{appStyles}</style>
        <div className="app-shell">
          <MainMenu
            onSelectRandom={() => handleStartGame(false)}
            onSelectDevTest={() => handleStartGame(true)}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <style>{combinedStyles}</style>
      <style>{appStyles}</style>

      <h1 className="app-title">War on Board</h1>
      {devMode && <span className="app-dev-badge">Dev Test</span>}

      <div className="app-shell">

        <div className="app-sidebar">
          <RoundCounter round={round} />
          <RoundHistory history={roundHistory} />
          <PlayFooter
            phase={phase}
            onConfirmPlacement={handleConfirmPlacement}
            onSkip={handleSkip}
            onBackToMenu={handleBackToMenu}
            canConfirm={canConfirm}
            canSkip={canSkip}
          />
        </div>

        <div className="app-center">
          {phase === 'gameover' ? (
            <div className="app-gameover">
              <h2>Game Over</h2>
              <p>
                {result === 'player' && 'You win!'}
                {result === 'ai'     && 'The opponent wins.'}
                {result === 'draw'   && "It's a draw."}
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
                dragonOverlayOwner={dragonOverlayOwner}
                devMode={devMode}
                playerStack={playerStack}
                aiStack={aiStack}
                onSwapAiCard={(cardId, newType) => handleDevSwapCard('ai', cardId, newType)}
                onSwapStackCard={handleDevSwapStackCard}
              />
              <Hand
                hand={playerHand}
                selectedCardId={selectedCardId}
                onCardClick={handleCardClick}
                disabled={phase !== 'placement'}
                devMode={devMode}
                stack={playerStack}
                onSwapCard={(cardId, newType) => handleDevSwapCard('player', cardId, newType)}
              />
            </>
          )}
        </div>

      </div>
    </>
  );
}

export default App;