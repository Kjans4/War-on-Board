// src/App.tsx

import { useEffect, useRef, useState, useCallback } from 'react';
import { useGameState } from './state/useGameState';
import { getAIPlacement } from './logic/ai';
import { findDragonPlacement } from './logic/combat';
import { Board } from './components/Board';
import type { RevealStep } from './components/Board';
import { Hand } from './components/Hand';
import { RoundCounter, PlayFooter } from './components/HUD';
import { RoundHistory } from './components/RoundHistory';
import { MainMenu } from './components/MainMenu';
import { CardFlightOverlay } from './components/CardFlightOverlay';
import type { FlightItem } from './components/CardFlightOverlay';
import type {
  Card as CardType,
  SlotKey,
  Owner,
  RoundResolution,
} from './types/game';
import { SLOT_KEYS } from './types/game';
import styles from './styles/App.module.css';

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

// [BLOCK: AI Placement Timing]
// How long after entering 'placement' the AI commits its 3 cards,
// independent of when the player finishes their own — see the new timer
// effect below. Board.tsx's slotVisuals keeps the AI's placed cards face-
// down until reveal regardless of this timing, so placing early never
// leaks information to the player.
const AI_PLACEMENT_DELAY_MS = 2000;

// [BLOCK: Return-Flight Timing]
// How long the discard/return flight animation takes once it starts.
// Inserted between the existing HISTORY_TO_NEXT_MS pause and the actual
// NEXT_ROUND dispatch — this genuinely extends total round length (by
// design: pacing takes a back seat to letting the flight read clearly).
const RETURN_FLIGHT_MS = 450;

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

// [BLOCK: Return-Flight Builder]
// Reads the round's ALREADY-COMPUTED, cascade-relabeled resolution (see
// useGameState.ts's REVEAL_ROUND "Cascade Relabeling" sub-block — any lane
// a cascade fight overrode already reads 'cascaded' there, not 'won', so
// survival can be read directly off resolution.player/ai with no separate
// cross-reference against pendingCascade needed). Never recomputes
// resolveRound/resolveCascade itself — see types/game.ts's
// GameState.pendingResolution doc comment on why re-running them would
// corrupt exhausted-flag mutations. Produces one flight per placed card:
// survivors target their own stack icon, everyone else (lost, tied-lost,
// dragon, cascaded) targets their own discard pile — mirroring the
// survivor-vs-discard split in useGameState.ts's NEXT_ROUND case exactly,
// but read-only.
function buildReturnFlights(
  resolution: RoundResolution,
  refs: Record<string, HTMLElement | null>
): FlightItem[] {
  const flights: FlightItem[] = [];

  for (const key of SLOT_KEYS) {
    const { player, ai, playerCard, aiCard } = resolution[key];

    const playerSurvives = player === 'won' || player === 'tied';
    const aiSurvives = ai === 'won' || ai === 'tied';

    const playerSlotEl = refs[`slot-player-${key}`];
    if (playerSlotEl) {
      const dest = refs[playerSurvives ? 'stack-player' : 'discard-player'];
      if (dest) {
        flights.push({
          id: `player-${key}`,
          card: playerCard,
          fromRect: playerSlotEl.getBoundingClientRect(),
          toRect: dest.getBoundingClientRect(),
          faceDown: false,
        });
      }
    }

    const aiSlotEl = refs[`slot-ai-${key}`];
    if (aiSlotEl) {
      const dest = refs[aiSurvives ? 'stack-ai' : 'discard-ai'];
      if (dest) {
        flights.push({
          id: `ai-${key}`,
          card: aiCard,
          fromRect: aiSlotEl.getBoundingClientRect(),
          toRect: dest.getBoundingClientRect(),
          faceDown: false,
        });
      }
    }
  }

  return flights;
}

function App() {
  const [started, setStarted] = useState(false);
  const { state, dispatch } = useGameState('random');
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [revealStep, setRevealStep] = useState<RevealStep>(null);
  const [dragonOverlayOwner, setDragonOverlayOwner] = useState<Owner | null>(null);
  const [flights, setFlights] = useState<FlightItem[]>([]);

  // [BLOCK: Timer Refs]
  // allTimers: every active timer ID — cleared on back-to-menu or skip
  // revealFiredForRound: guards against double-firing the reveal effect
  // historyRecordedForRound: guards against double-dispatching RECORD_HISTORY
  //   if the auto-transition t5 already fired before the player hits Skip
  const allTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const revealFiredForRound = useRef<number>(-1);
  const historyRecordedForRound = useRef<number>(-1);
  const aiPlacedForRound = useRef<number>(-1);

  // [BLOCK: Latest-State Ref]
  // The reveal effect's timers are all scheduled at the moment REVEAL_ROUND
  // fires, but the return-flight timer needs to read pendingResolution /
  // pendingCascade as they stand SEVERAL RENDERS LATER (after REVEAL_ROUND
  // has actually landed) — a normal closure over `state` here would be
  // stale. This ref is kept in sync on every render so timer callbacks can
  // read current state without re-running resolveRound/resolveCascade
  // themselves (which would corrupt exhausted-flag mutations — see
  // types/game.ts's GameState.pendingResolution doc comment).
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // [BLOCK: Element Ref Registry]
  // Populated by Board.tsx via registerRef for every stack icon, discard
  // pile, and slot — keyed e.g. 'stack-player', 'discard-ai',
  // 'slot-player-left'. Read by buildReturnFlights at return-flight time
  // to measure flight source/destination rects.
  const elementRefs = useRef<Record<string, HTMLElement | null>>({});
  const registerRef = useCallback((key: string, el: HTMLElement | null) => {
    elementRefs.current[key] = el;
  }, []);

  const {
    round, phase,
    playerStack, playerHand, playerSlots,
    aiStack, aiHand, aiSlots,
    ai, result, roundHistory,
    playerDiscard, aiDiscard,
    devMode,
  } = state;

  // [BLOCK: Auto-draw at round start]
  useEffect(() => {
    if (started && phase === 'draw') dispatch({ type: 'DRAW_CARDS' });
  }, [started, phase, dispatch]);

  // [BLOCK: AI Placement Timer]
  // Fires once per round, AI_PLACEMENT_DELAY_MS after entering 'placement'
  // — independent of when (or whether yet) the player has placed their
  // own cards. Guarded per-round the same way the reveal effect guards
  // itself, since this effect's dependency array can re-run for reasons
  // other than a genuinely new round (e.g. a re-render during placement).
  // No cleanup return, matching the reveal effect's convention — the only
  // way phase leaves 'placement' before this fires is handleBackToMenu,
  // which already clears every timer in allTimers.
  useEffect(() => {
    if (!started || phase !== 'placement') return;
    if (aiPlacedForRound.current === round) return;
    aiPlacedForRound.current = round;

    const timer = setTimeout(() => {
      const placements = getAIPlacement(aiHand, ai, round);
      dispatch({ type: 'PLACE_AI_CARDS', placements });
    }, AI_PLACEMENT_DELAY_MS);

    allTimers.current.push(timer);
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

    // [SUB-BLOCK: Return Flight]
    // Fires after the same HISTORY_TO_NEXT_MS pause the auto-transition
    // always used, but instead of immediately advancing the round, it
    // builds the return-flight ghosts (reading pendingResolution/
    // pendingCascade via stateRef, since those are only current several
    // renders after this effect started — see stateRef's doc comment).
    const returnFlightTimer = setTimeout(() => {
      const latest = stateRef.current;
      if (latest.pendingResolution) {
        setFlights(buildReturnFlights(latest.pendingResolution, elementRefs.current));
      }
    }, doneAt + DONE_TO_HISTORY_MS + HISTORY_TO_NEXT_MS);

    // NEXT_ROUND now waits out the return flight before actually advancing
    // — this is the "extend the timeline" tradeoff agreed on, rather than
    // squeezing the flight into existing windows.
    const nextRoundTimer = setTimeout(() => {
      setFlights([]);
      dispatch({ type: 'NEXT_ROUND' });
      setRevealStep(null);
      setDragonOverlayOwner(null);
    }, doneAt + DONE_TO_HISTORY_MS + HISTORY_TO_NEXT_MS + RETURN_FLIGHT_MS);

    allTimers.current = [...stepTimers, historyTimer, returnFlightTimer, nextRoundTimer];

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
  const aiHasPlaced = SLOT_KEYS.every((k) => aiSlots[k].card !== null);
  const canConfirm =
    phase === 'placement' &&
    SLOT_KEYS.every((k) => playerSlots[k].card !== null) &&
    aiHasPlaced;

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
    revealFiredForRound.current = -1;
    historyRecordedForRound.current = -1;
    aiPlacedForRound.current = -1;
    dispatch({ type: 'RESTART' });
    setSelectedCardId(null);
    setRevealStep(null);
    setDragonOverlayOwner(null);
    setFlights([]);
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
    dispatch({ type: 'START_REVEAL' });
  }

  // [BLOCK: Skip Handler]
  // Cancels all pending timers and immediately fires RECORD_HISTORY (if not
  // already dispatched for this round by the auto-transition timer) +
  // NEXT_ROUND, fast-forwarding through whatever part of the reveal/overlay
  // sequence was still running. Also clears any in-progress return flight
  // immediately — no point animating a flight the player just skipped past.
  function handleSkip() {
    if (!canSkip) return;
    allTimers.current.forEach(clearTimeout);
    allTimers.current = [];
    setFlights([]);
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
      <div className={styles['app-shell']}>
        <MainMenu
          onSelectRandom={() => handleStartGame(false)}
          onSelectDevTest={() => handleStartGame(true)}
        />
      </div>
    );
  }

  // [BLOCK: Render — Game]
  return (
    <>
      <h1 className={styles['app-title']}>War on Board</h1>
      {devMode && <span className={styles['app-dev-badge']}>Dev Test</span>}

      <div className={styles['app-shell']}>

        {/* [SUB-BLOCK: Sidebar] */}
        <div className={styles['app-sidebar']}>
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
        <div className={styles['app-center']}>
          {phase === 'gameover' ? (
            <div className={styles['app-gameover']}>
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
                onAiSwapCard={(cardId, newType) =>
                  dispatch({ type: 'DEV_SWAP_HAND_CARD', owner: 'ai', cardId, newType })
                }
                playerStackCount={playerStack.length}
                aiStackCount={aiStack.length}
                playerDiscardCount={playerDiscard.length}
                aiDiscardCount={aiDiscard.length}
                onShuffleStack={handleShuffleStack}
                canShuffle={canShuffle}
                dragonOverlayOwner={dragonOverlayOwner}
                devMode={devMode}
                playerStack={playerStack}
                aiStack={aiStack}
                registerRef={registerRef}
              />
              <Hand
                hand={playerHand}
                selectedCardId={selectedCardId}
                onCardClick={handleCardClick}
                disabled={phase !== 'placement'}
                devMode={devMode}
                stack={playerStack}
                onSwapCard={(cardId, newType) =>
                  dispatch({ type: 'DEV_SWAP_HAND_CARD', owner: 'player', cardId, newType })
                }
              />
            </>
          )}
        </div>

      </div>

      <CardFlightOverlay flights={flights} durationMs={RETURN_FLIGHT_MS} />
    </>
  );
}

export default App;