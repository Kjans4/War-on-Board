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
import type { Card as CardType, SlotKey, Owner } from './types/game';
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

// [BLOCK: AI Placement Timing (ms)]
// How long after entering 'placement' phase the AI automatically fills its
// 3 slots. Non-skippable by design — the player cannot force this early by
// finishing their own placement faster; Play stays disabled until the AI
// has placed regardless of how quickly the player places their cards.
const AI_PLACEMENT_DELAY_MS = 2000;

// [BLOCK: Reveal + Auto-Transition Timings (ms)]
// Base per-slot stagger timings — used verbatim for non-Dragon rounds, and
// as building blocks for the Dragon-aware timeline below.
const FLIP_TO_LEFT_MS    = 2000;
const LEFT_TO_CENTER_MS  = 1500;
const CENTER_TO_RIGHT_MS = 1500;
const RIGHT_TO_DONE_MS   = 800;
const DONE_TO_HISTORY_MS = 500;
const HISTORY_TO_NEXT_MS = 1500;

// Dragon-specific timing: a short pause after all cards are face-up before
// the "Dragon Attack" banner appears, then how long the banner alone holds
// before outcome badges are allowed to pop in (i.e. before 'done').
const DRAGON_OVERLAY_DELAY_MS = 500;
const DRAGON_OVERLAY_HOLD_MS = 1400;

// [BLOCK: Reveal Timeline Builder]
// Produces the ordered list of {step, at} events to schedule as timeouts,
// plus the final "done" timestamp (from which RECORD_HISTORY / NEXT_ROUND
// are scheduled, unchanged from before).
//
// Non-Dragon rounds: unchanged staggered Left -> Center -> Right -> done.
//
// Dragon rounds: reveal proceeds normally up to and including the Dragon's
// own slot; the moment the Dragon's slot would reveal, any slots that
// haven't revealed yet jump ahead and reveal simultaneously with it
// (achieved by jumping straight to the 'right' step, which — per
// Board.tsx's slotVisuals — reveals all 3 slots at once regardless of
// order). After a short pause, the 'dragonOverlay' step shows the banner;
// after it holds, 'done' reveals the outcome badges (already carrying the
// Dragon's wipe/save effects, computed synchronously by the reducer).
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
    // Dragon in Left — everything reveals simultaneously right away.
    events.push({ step: 'right', at: t });
  } else if (dragonSlotIndex === 1) {
    // Dragon in Center — Left reveals normally first, then Center+Right
    // jump ahead together when the Dragon's turn comes up.
    events.push({ step: 'left', at: t });
    t += LEFT_TO_CENTER_MS;
    events.push({ step: 'right', at: t });
  } else {
    // Dragon in Right — nothing to jump ahead, it's already last in the
    // normal sequence.
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

  // [BLOCK: Timer Refs]
  // allTimers: every active reveal/auto-transition timer ID — cleared on
  //   back-to-menu or skip
  // revealFiredForRound: guards against double-firing the reveal effect
  // historyRecordedForRound: guards against double-dispatching RECORD_HISTORY
  //   if the auto-transition t5 already fired before the player hits Skip
  // aiPlacementTimerRef: the single pending "AI places its cards" timeout —
  //   tracked separately from allTimers since it belongs to the placement
  //   phase, not the reveal/auto-transition chain
  // aiPlacedForRound: guards against re-scheduling the AI placement timer
  //   if this effect re-fires for the same round (e.g. StrictMode double-run)
  const allTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const revealFiredForRound = useRef<number>(-1);
  const historyRecordedForRound = useRef<number>(-1);
  const aiPlacementTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiPlacedForRound = useRef<number>(-1);

  const {
    round, phase,
    playerStack, playerHand, playerSlots,
    aiStack, aiHand, aiSlots,
    ai, result, roundHistory,
    devMode,
  } = state;

  // [BLOCK: Auto-draw at round start]
  useEffect(() => {
    if (started && phase === 'draw') dispatch({ type: 'DRAW_CARDS' });
  }, [started, phase, dispatch]);

  // [BLOCK: AI Auto-Placement — 2s after entering placement phase]
  // Fires once per round the moment phase becomes 'placement'. The AI
  // fills its 3 slots automatically via AI_PLACE_CARDS (which does NOT
  // advance phase — see useGameState.ts) regardless of how quickly the
  // player places their own cards; this is intentionally non-skippable so
  // the player can always see the AI commit before Play unlocks (canConfirm
  // below is gated on both sides being placed).
  useEffect(() => {
    if (!started || phase !== 'placement') return;
    if (aiPlacedForRound.current === round) return;
    aiPlacedForRound.current = round;

    const timer = setTimeout(() => {
      const placements = getAIPlacement(aiHand, ai, round);
      dispatch({ type: 'AI_PLACE_CARDS', placements });
    }, AI_PLACEMENT_DELAY_MS);

    aiPlacementTimerRef.current = timer;

    // intentionally no cleanup return — mirrors the reveal effect below;
    // the timer is only ever cleared explicitly (back-to-menu) or left to
    // fire naturally once per round
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, phase, round]);

  // [BLOCK: Reveal + Auto-Transition Sequence]
  // Fires once per round when phase enters 'reveal'.
  // REVEAL_ROUND dispatched immediately (resolves game state, phase → resolution).
  // Visual timer chain runs independently — no cleanup return so timers survive
  // the reveal→resolution phase transition.
  useEffect(() => {
    if (!started || phase !== 'reveal') return;
    if (revealFiredForRound.current === round) return;
    revealFiredForRound.current = round;

    // Detect the Dragon's placement from the CURRENT round's placed cards
    // (playerSlots/aiSlots already hold them, pre-resolution) — needed
    // before REVEAL_ROUND's dispatch has actually updated state, since
    // dispatch is async relative to this effect. Returns null for
    // no-Dragon rounds AND both-sides-Dragon rounds (a cancel, not a wipe —
    // no overlay for that case).
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

    // intentionally no cleanup return — timers must survive reveal→resolution
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, phase, round]);

  // [BLOCK: Reset reveal step when new round placement begins]
  useEffect(() => {
    if (phase === 'placement') setRevealStep(null);
  }, [phase]);

  // [BLOCK: Clear card selection when leaving placement]
  useEffect(() => {
    if (phase !== 'placement') setSelectedCardId(null);
  }, [phase]);

  // [BLOCK: Derived values]
  // canConfirm: Play only unlocks once the player's 3 slots AND the AI's 3
  // slots are filled. The AI side fills itself (see AI Auto-Placement
  // effect above) — this is what makes the AI's placement non-skippable:
  // there's no path for the player to force Play active before the AI has
  // committed, no matter how fast their own 3 cards go down.
  const canConfirm =
    phase === 'placement' &&
    SLOT_KEYS.every((k) => playerSlots[k].card !== null) &&
    SLOT_KEYS.every((k) => aiSlots[k].card !== null);

  // canSkip: true for the entire reveal + auto-transition window.
  // Phase is already 'resolution' by the time revealStep is set (REVEAL_ROUND
  // fires immediately), so this covers flipping → left/center/right (or the
  // Dragon-jump equivalent) → dragonOverlay (if applicable) → done → post-done
  // transition, all the way until NEXT_ROUND fires.
  const canSkip = revealStep !== null && phase === 'resolution';

  const canShuffle = phase !== 'reveal' && phase !== 'gameover' && revealStep === null;
  const placementActive = phase === 'placement';
  const selectedCard = playerHand.find((c) => c.id === selectedCardId) ?? null;

  // [BLOCK: Handlers]
  // devMode is dispatched into reducer state BEFORE flipping `started` to
  // true, so it's already set by the time the DRAW_CARDS effect fires.
  function handleStartGame(devModeOn: boolean) {
    dispatch({ type: 'SET_DEV_MODE', devMode: devModeOn });
    setStarted(true);
  }

  function handleBackToMenu() {
    allTimers.current.forEach(clearTimeout);
    allTimers.current = [];
    if (aiPlacementTimerRef.current) clearTimeout(aiPlacementTimerRef.current);
    aiPlacementTimerRef.current = null;
    revealFiredForRound.current = -1;
    historyRecordedForRound.current = -1;
    aiPlacedForRound.current = -1;
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

  // [BLOCK: Confirm Handler]
  // No longer computes AI placement itself — the AI already placed via its
  // own 2s timer (see AI Auto-Placement effect above). This just advances
  // phase to 'reveal', and canConfirm already guarantees both sides are
  // filled before this is reachable.
  function handleConfirmPlacement() {
    if (!canConfirm) return;
    dispatch({ type: 'CONFIRM_PLACEMENT' });
  }

  // [BLOCK: Skip Handler]
  // Cancels all pending timers and immediately fires RECORD_HISTORY (if not
  // already dispatched for this round by the auto-transition timer) +
  // NEXT_ROUND, fast-forwarding through whatever part of the reveal/overlay
  // sequence was still running.
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

  // [BLOCK: Render — Main Menu]
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

  // [BLOCK: Render — Game]
  return (
    <>
      <style>{combinedStyles}</style>
      <style>{appStyles}</style>

      <h1 className="app-title">War on Board</h1>
      {devMode && <span className="app-dev-badge">Dev Test</span>}

      <div className="app-shell">

        {/* [SUB-BLOCK: Sidebar] */}
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

        {/* [SUB-BLOCK: Center — Battlefield + Hand] */}
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
                phase={phase}
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