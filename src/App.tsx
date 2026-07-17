// src/App.tsx

import { useEffect, useRef, useState, useCallback } from 'react';
import clsx from 'clsx';
import { useGameState } from './state/useGameState';
import { getAIPlacement } from './logic/ai';
import { findDragonPlacement } from './logic/combat';
import { Board } from './components/Board';
import type { RevealStep } from './components/Board';
import { Hand } from './components/Hand';
import { CardPile } from './components/CardPile';
import { PlayerStackControls } from './components/PlayerStackControls';
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
  CombatOutcome,
  CascadeFightLog,
} from './types/game';
import { SLOT_KEYS } from './types/game';
import styles from './styles/App.module.css';
// [Layout — Hand Row Symmetric Ghost] Reuses Board.module.css's
// stack-col-wrap / stack-col__shuffle classes to render an invisible
// clone of PlayerStackControls' footprint on the opposite side of Hand —
// see the app-hand-row__side ghost below for why.
import boardStyles from './styles/Board.module.css';

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

// [BLOCK: Battle Phases — Timing]
// PHASE1_RESOLVE_HOLD_MS: how long the Phase 1 resolve beat holds — all 3
// lanes revealed, non-cascade-pending outcomes (lost/tied-lost/tied) final
// and their flights fired — before either the first cascadeFight step or
// 'done' (if no cascade runs) begins.
//
// CASCADE_FIGHT_MS: duration of a single cascade fight beat. One of these
// is scheduled per cascade.log entry (cascade.log.length total) — see
// combat.ts's resolveCascade/CascadeFightLog. Glow + reveal + flight for
// that beat's loser all fire together at the start of the beat (see
// buildCascadeFightFlights) — the remaining CASCADE_FIGHT_MS is just a
// readable hold before the next beat (or 'done') begins.
const PHASE1_RESOLVE_HOLD_MS = 900;
const CASCADE_FIGHT_MS = 1100;

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

// [BLOCK: Reveal Timeline Types]
interface StepEvent {
  step: RevealStep;
  at: number;
}

// [BLOCK: Dragon Timeline Builder]
// Dragon rounds never run a cascade (combat.ts's roundHasDragon gates
// resolveCascade off entirely for them — see REVEAL_ROUND in
// useGameState.ts), so their full timeline is knowable synchronously,
// exactly as before Battle Phases existed. Reveal proceeds normally up to
// and including the Dragon's own slot; the moment the Dragon's slot would
// reveal, any slots that haven't revealed yet jump ahead and reveal
// simultaneously with it (achieved by jumping straight to the 'right'
// step, which — per Board.tsx's slotVisuals — reveals all 3 slots at once
// regardless of order). After a short pause, 'dragonOverlay' shows the
// banner; after it holds, 'done' reveals the outcome badges.
function buildDragonTimeline(dragonSlotIndex: number): { events: StepEvent[]; doneAt: number } {
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

// [BLOCK: Left/Center/Right Builder — non-Dragon rounds]
// Non-Dragon rounds share this fixed stagger regardless of what happens
// afterward — it doesn't depend on cascade data, so it's still knowable
// synchronously at REVEAL_ROUND dispatch time.
function buildLeftCenterRightEvents(): { events: StepEvent[]; rightAt: number } {
  const leftAt = FLIP_TO_LEFT_MS;
  const centerAt = leftAt + LEFT_TO_CENTER_MS;
  const rightAt = centerAt + CENTER_TO_RIGHT_MS;
  return {
    events: [
      { step: 'left', at: leftAt },
      { step: 'center', at: centerAt },
      { step: 'right', at: rightAt },
    ],
    rightAt,
  };
}

// [BLOCK: Battle Phases — Cascade-Aware Schedule]
// Computes the phase1Resolve -> cascadeFight(s) -> done schedule for a
// non-Dragon round, given how many cascade fights actually happened this
// round (cascade.log.length). Can't be computed synchronously alongside
// buildLeftCenterRightEvents the way Dragon detection is (via
// findDragonPlacement on pre-resolution slots) — cascade.log only exists
// after resolveCascade() has actually run inside the reducer, and dispatch
// is async relative to the effect that calls this. The reveal effect below
// calls this from inside a timer fired at rightAt, once
// stateRef.current.pendingCascade is guaranteed to be populated.
// Re-running resolveCascade() early to peek at the count instead would
// double-mutate card.exhausted (see combat.ts's resolveSlot /
// types/game.ts's GameState.pendingResolution doc comment), so waiting is
// required, not just convenient.
//
// phase1ResolveAt keeps the same RIGHT_TO_DONE_MS pause that used to sit
// between 'right' and 'done' — cards hold face-up for a beat before
// results start resolving, same pacing as before Battle Phases existed.
interface Phase1Schedule {
  events: StepEvent[];
  doneAt: number; // same clock/origin as rightAt (time since REVEAL_ROUND dispatch)
}

function buildCascadeAwareSchedule(rightAt: number, cascadeFightCount: number): Phase1Schedule {
  const phase1ResolveAt = rightAt + RIGHT_TO_DONE_MS;
  let t = phase1ResolveAt + PHASE1_RESOLVE_HOLD_MS;

  const events: StepEvent[] = [
    { step: 'phase1Resolve', at: phase1ResolveAt },
  ];

  for (let i = 0; i < cascadeFightCount; i++) {
    events.push({ step: 'cascadeFight', at: t });
    t += CASCADE_FIGHT_MS;
  }

  events.push({ step: 'done', at: t });

  return { events, doneAt: t };
}

// [BLOCK: Phase 1 Flight Builder]
// [Battle Phases] Fires at phase1Resolve — flies only the lanes that are
// FINAL in Phase 1 and never touched by a cascade: lost/tied-lost cards go
// to discard, tied cards return to the stack. Cascade-pending lanes (still
// reading 'won', or already relabeled 'cascaded' — see useGameState.ts's
// REVEAL_ROUND "Cascade Relabeling" sub-block) are deliberately excluded
// here; those get their own flight from buildCascadeFightFlights below,
// fired exactly when their specific fight resolves. Reads resolution
// directly, same read-only, never-recompute discipline as
// buildReturnFlights below.
function buildPhase1Flights(
  resolution: RoundResolution,
  refs: Record<string, HTMLElement | null>
): FlightItem[] {
  const flights: FlightItem[] = [];

  for (const key of SLOT_KEYS) {
    const { player, ai, playerCard, aiCard } = resolution[key];

    if (player === 'lost' || player === 'tied-lost' || player === 'tied') {
      const fromEl = refs[`slot-player-${key}`];
      const destKey = player === 'tied' ? 'stack-player' : 'discard-player';
      const dest = refs[destKey];
      if (fromEl && dest) {
        flights.push({
          id: `player-${key}-p1`,
          card: playerCard,
          fromRect: fromEl.getBoundingClientRect(),
          toRect: dest.getBoundingClientRect(),
          faceDown: false,
        });
      }
    }

    if (ai === 'lost' || ai === 'tied-lost' || ai === 'tied') {
      const fromEl = refs[`slot-ai-${key}`];
      const destKey = ai === 'tied' ? 'stack-ai' : 'discard-ai';
      const dest = refs[destKey];
      if (fromEl && dest) {
        flights.push({
          id: `ai-${key}-p1`,
          card: aiCard,
          fromRect: fromEl.getBoundingClientRect(),
          toRect: dest.getBoundingClientRect(),
          faceDown: false,
        });
      }
    }
  }

  return flights;
}

// [BLOCK: Cascade Fight Flight Builder]
// [Battle Phases — Phase 3] Fires once per cascade.log entry, at that
// beat's start — flies exactly the card(s) THAT SPECIFIC FIGHT eliminates
// to discard. Mirrors combat.ts's resolveCascade outcome handling exactly:
//   - championWon:   challenger's card falls, champion stands (no flight
//                     for the champion yet — it may still be challenged
//                     again in a later beat, see Board.tsx's
//                     hasCascadeLaneResolved doc comment).
//   - challengerWon: champion's card falls, challenger becomes the new
//                     champion (same "no flight yet" reasoning).
//   - tied:          a fresh-vs-fresh tie inside the cascade — chain
//                     halts, BOTH sides withdraw as survivors, neither is
//                     eliminated. No flight this beat; both fly home in
//                     the final wave like any other 'won' lane (their
//                     lane-level outcome field is untouched by a cascade
//                     'tied' result — see combat.ts's resolveCascade,
//                     which never adds a plain tie to `overrides`).
//   - tiedLost:      exhausted vs exhausted inside the cascade — chain
//                     halts, BOTH cards are eliminated.
// resolveCascade guarantees champion and challenger are always different
// owners (same-owner entries only ever get queued as reserves, never
// fought directly), so looking up exactly one Card per side is safe.
function buildCascadeFightFlights(
  fightLog: CascadeFightLog,
  fightIndex: number,
  resolution: RoundResolution,
  refs: Record<string, HTMLElement | null>
): FlightItem[] {
  const flights: FlightItem[] = [];

  function flyLoser(owner: Owner, slotKey: SlotKey) {
    const card = owner === 'player' ? resolution[slotKey].playerCard : resolution[slotKey].aiCard;
    const fromEl = refs[`slot-${owner}-${slotKey}`];
    const dest = refs[`discard-${owner}`];
    if (fromEl && dest) {
      flights.push({
        id: `cascade-${fightIndex}-${owner}-${slotKey}`,
        card,
        fromRect: fromEl.getBoundingClientRect(),
        toRect: dest.getBoundingClientRect(),
        faceDown: false,
      });
    }
  }

  switch (fightLog.outcome) {
    case 'championWon':
      flyLoser(fightLog.challengerOwner, fightLog.challengerSlot);
      break;
    case 'challengerWon':
      flyLoser(fightLog.championOwner, fightLog.championSlot);
      break;
    case 'tiedLost':
      flyLoser(fightLog.championOwner, fightLog.championSlot);
      flyLoser(fightLog.challengerOwner, fightLog.challengerSlot);
      break;
    case 'tied':
      // Both withdraw as survivors — no elimination flight this beat.
      break;
  }

  return flights;
}

// [BLOCK: Return-Flight Builder — final wave]
// Reads the round's ALREADY-COMPUTED, cascade-relabeled resolution (see
// useGameState.ts's REVEAL_ROUND "Cascade Relabeling" sub-block — any lane
// a cascade fight overrode already reads 'cascaded' there, not 'won', so
// survival can be read directly off resolution.player/ai with no separate
// cross-reference against pendingCascade needed). Never recomputes
// resolveRound/resolveCascade itself — see types/game.ts's
// GameState.pendingResolution doc comment on why re-running them would
// corrupt exhausted-flag mutations.
//
// [Battle Phases] skipOutcomes lets the caller exclude lanes that already
// flew in an earlier wave this round, so this final wave never double-
// animates the same card. Non-Dragon rounds pass EARLY_FLIGHT_OUTCOMES
// (lost/tied-lost/tied, handled by buildPhase1Flights, plus cascaded,
// handled by buildCascadeFightFlights); Dragon rounds pass the default
// empty set, since they never run either earlier wave and still need
// every card animated here, same as before Battle Phases existed.
function buildReturnFlights(
  resolution: RoundResolution,
  refs: Record<string, HTMLElement | null>,
  skipOutcomes: Set<CombatOutcome> = new Set()
): FlightItem[] {
  const flights: FlightItem[] = [];

  for (const key of SLOT_KEYS) {
    const { player, ai, playerCard, aiCard } = resolution[key];

    if (!skipOutcomes.has(player)) {
      const playerSurvives = player === 'won' || player === 'tied';
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
    }

    if (!skipOutcomes.has(ai)) {
      const aiSurvives = ai === 'won' || ai === 'tied';
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
  }

  return flights;
}

// [Battle Phases] Non-Dragon rounds fly lost/tied-lost/tied cards away in
// the Phase 1 wave, and cascaded cards away in their own cascade fight
// beat — the final wave must skip all four so it never re-animates a card
// that already left. Declared once, module-level, since the set is always
// identical for every non-Dragon round.
const EARLY_FLIGHT_OUTCOMES = new Set<CombatOutcome>(['lost', 'tied-lost', 'tied', 'cascaded']);

function App() {
  const [started, setStarted] = useState(false);
  const { state, dispatch } = useGameState('random');
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  // [Dev Test Mode] Mirrors selectedCardId above, but for manually editing
  // the AI's own slots (Option A parity — see handleAiCardClick/
  // handleAiSlotClick below). Only ever meaningfully set while devMode is
  // on; harmless/unused otherwise since Board only wires onAiCardClick's
  // click handler when aiEditable is true.
  const [selectedAiCardId, setSelectedAiCardId] = useState<string | null>(null);
  const [revealStep, setRevealStep] = useState<RevealStep>(null);
  const [dragonOverlayOwner, setDragonOverlayOwner] = useState<Owner | null>(null);
  // [Battle Phases — Phase 3] Which cascade.log entry is currently
  // playing, or null outside of a cascade fight beat — see Board.tsx's
  // hasCascadeLaneResolved / isCurrentCascadeFightSlot, which both key off
  // this alongside pendingCascade to decide per-lane reveal + glow timing.
  const [cascadeFightIndex, setCascadeFightIndex] = useState<number | null>(null);
  const [flights, setFlights] = useState<FlightItem[]>([]);

  // [BLOCK: Timer Refs]
  // allTimers: every active timer ID — cleared on back-to-menu or skip.
  //   Timers are pushed in directly as they're created, including ones
  //   created inside nested/later-firing timers (see the Battle Phases
  //   orchestration below), rather than assembled into one array at the
  //   end — the cascade-aware portion of a round's schedule isn't fully
  //   known until partway through, so there's no single synchronous point
  //   left to build the whole list at once.
  // revealFiredForRound: guards against double-firing the reveal effect
  // historyRecordedForRound: guards against double-dispatching RECORD_HISTORY
  //   if the auto-transition t5 already fired before the player hits Skip
  const allTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const revealFiredForRound = useRef<number>(-1);
  const historyRecordedForRound = useRef<number>(-1);
  const aiPlacedForRound = useRef<number>(-1);

  // [BLOCK: Latest-State Ref]
  // The reveal effect's timers are all scheduled at the moment REVEAL_ROUND
  // fires, but several of them (return-flight, and now the cascade-aware
  // schedule + Phase 1 / cascade-fight flight waves) need to read
  // pendingResolution / pendingCascade as they stand SEVERAL RENDERS LATER
  // (after REVEAL_ROUND has actually landed) — a normal closure over
  // `state` here would be stale. This ref is kept in sync on every render
  // so timer callbacks can read current state without re-running
  // resolveRound/resolveCascade themselves (which would corrupt
  // exhausted-flag mutations — see types/game.ts's
  // GameState.pendingResolution doc comment).
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // [BLOCK: Element Ref Registry]
  // Populated by Board.tsx via registerRef for every stack icon, discard
  // pile, and slot — keyed e.g. 'stack-player', 'discard-ai',
  // 'slot-player-left'. Read by buildReturnFlights/buildPhase1Flights/
  // buildCascadeFightFlights at flight time to measure flight source/
  // destination rects.
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
    pendingCascade,
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
  //
  // [Battle Phases] Branches in two shapes from here:
  //   - Dragon rounds: full timeline known upfront (buildDragonTimeline) —
  //     scheduled exactly as before Battle Phases existed.
  //   - Non-Dragon rounds: only left/center/right is known upfront
  //     (buildLeftCenterRightEvents). The cascade-aware portion
  //     (phase1Resolve -> cascadeFight(s) -> done) is scheduled from
  //     INSIDE the timer that fires at 'right', once pendingCascade is
  //     guaranteed to be populated — see buildCascadeAwareSchedule's doc
  //     comment for why this can't happen any earlier.
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

    // [SUB-BLOCK: schedule downstream history/return-flight/next-round
    // timers off a given delay] `doneDelay` is milliseconds from THE
    // MOMENT THIS FUNCTION IS CALLED, not an absolute offset from
    // REVEAL_ROUND dispatch — the two call sites below are NOT at the same
    // point in time, so this matters:
    //   - Dragon branch calls it synchronously, right after dispatch — "now"
    //     really is 0, so buildDragonTimeline's doneAt (already relative to
    //     dispatch) can be passed straight through.
    //   - Non-Dragon branch calls it from INSIDE the timer that fires at
    //     rightAt — "now" is already rightAt by then, so the caller must
    //     pass buildCascadeAwareSchedule's doneAt MINUS rightAt, or every
    //     downstream timer fires rightAt milliseconds later than intended
    //     (silently, since nothing throws — just a slow-motion round).
    // skipOutcomes is passed straight through to buildReturnFlights — see
    // its doc comment. Also resets cascadeFightIndex back to null, whether
    // or not this round ever set it, so it never leaks into next round's
    // early steps.
    function scheduleEndOfRoundTimers(doneDelay: number, skipOutcomes: Set<CombatOutcome>) {
      const historyTimer = setTimeout(() => {
        historyRecordedForRound.current = round;
        dispatch({ type: 'RECORD_HISTORY' });
      }, doneDelay + DONE_TO_HISTORY_MS);
      allTimers.current.push(historyTimer);

      const returnFlightTimer = setTimeout(() => {
        const latest = stateRef.current;
        if (latest.pendingResolution) {
          setFlights(buildReturnFlights(latest.pendingResolution, elementRefs.current, skipOutcomes));
        }
      }, doneDelay + DONE_TO_HISTORY_MS + HISTORY_TO_NEXT_MS);
      allTimers.current.push(returnFlightTimer);

      const nextRoundTimer = setTimeout(() => {
        setFlights([]);
        dispatch({ type: 'NEXT_ROUND' });
        setRevealStep(null);
        setDragonOverlayOwner(null);
        setCascadeFightIndex(null);
      }, doneDelay + DONE_TO_HISTORY_MS + HISTORY_TO_NEXT_MS + RETURN_FLIGHT_MS);
      allTimers.current.push(nextRoundTimer);
    }

    if (dragonSlotIndex !== null) {
      // [Dragon branch — unchanged from before Battle Phases existed]
      // Called synchronously at dispatch time, so doneAt IS the delay from
      // "now" — no adjustment needed.
      const { events, doneAt } = buildDragonTimeline(dragonSlotIndex);
      for (const e of events) {
        const t = setTimeout(() => setRevealStep(e.step), e.at);
        allTimers.current.push(t);
      }
      scheduleEndOfRoundTimers(doneAt, new Set());
      return;
    }

    // [Non-Dragon branch — Battle Phases]
    const { events: lcrEvents, rightAt } = buildLeftCenterRightEvents();

    for (const e of lcrEvents) {
      if (e.step === 'right') continue; // handled below, combined with orchestration
      const t = setTimeout(() => setRevealStep(e.step), e.at);
      allTimers.current.push(t);
    }

    const rightTimer = setTimeout(() => {
      setRevealStep('right');

      // pendingCascade is guaranteed populated by now — REVEAL_ROUND
      // landed long before this fires (at minimum FLIP_TO_LEFT_MS +
      // LEFT_TO_CENTER_MS + CENTER_TO_RIGHT_MS after dispatch).
      const cascade = stateRef.current.pendingCascade;
      const cascadeFightCount = cascade?.log.length ?? 0;
      const { events: phaseEvents, doneAt } = buildCascadeAwareSchedule(rightAt, cascadeFightCount);

      let fightCounter = 0;

      for (const e of phaseEvents) {
        const delay = e.at - rightAt; // relative to now, since we're already at rightAt
        const t = setTimeout(() => setRevealStep(e.step), delay);
        allTimers.current.push(t);

        if (e.step === 'phase1Resolve') {
          const flightTimer = setTimeout(() => {
            const resolution = stateRef.current.pendingResolution;
            if (resolution) {
              setFlights(buildPhase1Flights(resolution, elementRefs.current));
            }
          }, delay);
          allTimers.current.push(flightTimer);

          const clearTimer = setTimeout(() => setFlights([]), delay + RETURN_FLIGHT_MS);
          allTimers.current.push(clearTimer);
        }

        if (e.step === 'cascadeFight') {
          const idx = fightCounter;
          fightCounter += 1;

          const fightTimer = setTimeout(() => {
            setCascadeFightIndex(idx);
            const latestCascade = stateRef.current.pendingCascade;
            const latestResolution = stateRef.current.pendingResolution;
            const fightLog = latestCascade?.log[idx];
            if (fightLog && latestResolution) {
              setFlights(buildCascadeFightFlights(fightLog, idx, latestResolution, elementRefs.current));
            }
          }, delay);
          allTimers.current.push(fightTimer);

          const clearTimer = setTimeout(() => setFlights([]), delay + RETURN_FLIGHT_MS);
          allTimers.current.push(clearTimer);
        }

        if (e.step === 'done') {
          const doneClearTimer = setTimeout(() => setCascadeFightIndex(null), delay);
          allTimers.current.push(doneClearTimer);
        }
      }

      // We're already running at rightAt (this whole callback fired at
      // rightAt), so doneAt — which is absolute-since-dispatch and
      // includes rightAt within it — must have rightAt subtracted back out
      // to become a valid "from now" delay. See scheduleEndOfRoundTimers'
      // doc comment above.
      scheduleEndOfRoundTimers(doneAt - rightAt, EARLY_FLIGHT_OUTCOMES);
    }, rightAt);
    allTimers.current.push(rightTimer);

    // intentionally no cleanup return — timers must survive reveal→resolution
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, phase, round]);

  // [BLOCK: Reset reveal step when new round placement begins]
  useEffect(() => {
    if (phase === 'placement') {
      setRevealStep(null);
      setCascadeFightIndex(null);
    }
  }, [phase]);

  // [BLOCK: Clear card selection when leaving placement]
  useEffect(() => {
    if (phase !== 'placement') {
      setSelectedCardId(null);
      setSelectedAiCardId(null);
    }
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
  // Dragon-jump equivalent) → phase1Resolve → cascadeFight(s) →
  // dragonOverlay (if applicable) → done → post-done transition, all the
  // way until NEXT_ROUND fires.
  const canSkip = revealStep !== null && phase === 'resolution';

  const canShuffle = phase !== 'reveal' && phase !== 'gameover' && revealStep === null;
  const placementActive = phase === 'placement';
  const selectedCard = playerHand.find((c) => c.id === selectedCardId) ?? null;
  // [Dev Test Mode] Mirrors selectedCard above for the AI side.
  const selectedAiCard = aiHand.find((c) => c.id === selectedAiCardId) ?? null;

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
    setCascadeFightIndex(null);
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

  // [Dev Test Mode — Option A] Mirrors handleCardClick/handleSlotClick
  // above exactly, but dispatches the AI-specific PLACE_AI_CARD/
  // REMOVE_AI_CARD actions against aiHand/aiSlots instead. Only ever
  // reachable via Board's onAiCardClick/onAiSlotClick, which are only
  // wired to be clickable when aiEditable (devMode && placementActive) —
  // normal play never calls these.
  function handleAiCardClick(card: CardType) {
    if (phase !== 'placement') return;
    setSelectedAiCardId((prev) => (prev === card.id ? null : card.id));
  }

  function handleAiSlotClick(slotKey: SlotKey) {
    if (phase !== 'placement') return;
    const slot = aiSlots[slotKey];
    if (slot.card) {
      dispatch({ type: 'REMOVE_AI_CARD', slotKey });
      return;
    }
    if (selectedAiCard) {
      dispatch({ type: 'PLACE_AI_CARD', slotKey, card: selectedAiCard });
      setSelectedAiCardId(null);
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
  // [Battle Phases] Still a clean no-op regardless of how far through the
  // phase1Resolve/cascadeFight sequence the round was — state itself was
  // never mutated mid-round (Option A: visual only, see
  // battle-phases-plan.md), so NEXT_ROUND alone still correctly derives
  // survivors/discards from pendingResolution no matter which timers were
  // cancelled. cascadeFightIndex is reset here too so a skip mid-cascade
  // doesn't leave a stale glow/reveal state bleeding into next round.
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
    setCascadeFightIndex(null);
  }

  function handleShuffleStack() {
    dispatch({ type: 'SHUFFLE_STACK' });
  }

  // [BLOCK: Render — Main Menu]
  // [Background Art] Uses plain .app-shell here — no table background —
  // since the menu's own art lives on MainMenu.module.css's .main-menu
  // instead (see that file's doc comment).
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
  // [Background Art] app-shell--table layered on top of the base
  // app-shell class ONLY here — the wood-grain table background is meant
  // to sit behind the whole game screen (sidebar included), never behind
  // the Main Menu above.
  return (
    <>
      <div className={clsx(styles['app-shell'], styles['app-shell--table'])}>

        {/* [SUB-BLOCK: Left Sidebar — unified wood-panel frame]
            Replaces the old three-piece floating layout (bare
            RoundCounter, self-framed RoundHistory, bare PlayFooter) with a
            single .left-sidebar frame (see App.module.css) split into a
            header (Round Counter), a flex:1 scrollable body (RoundHistory
            itself — it now only supplies the scrolling list, no frame of
            its own, see RoundHistory.module.css), and a footer
            (Play/Main Menu). Only the middle RoundHistory section
            scrolls; header and footer stay pinned. */}
        <div className={styles['left-sidebar']}>
          <div className={styles['left-sidebar__header']}>
            <RoundCounter round={round} />
          </div>
          <RoundHistory history={roundHistory} />
          <div className={styles['left-sidebar__footer']}>
            <PlayFooter
              phase={phase}
              onConfirmPlacement={handleConfirmPlacement}
              onSkip={handleSkip}
              onBackToMenu={handleBackToMenu}
              canConfirm={canConfirm}
              canSkip={canSkip}
            />
          </div>
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
            /* [Layout — Centering Fix] Board and the Hand/Stack row are now
               grouped in one flex-column wrapper (align-items: stretch by
               default) instead of being two separate children of
               app-center — see App.module.css's .app-board-column doc
               comment for why: it lets .app-hand-row inherit Board's own
               rendered width automatically, which is what makes the row's
               symmetric side-regions below actually work (they need a
               stable, Board-matched width to distribute against). */
            <div className={styles['app-board-column']}>
              <Board
                playerSlots={playerSlots}
                aiSlots={aiSlots}
                aiHand={aiHand}
                revealStep={revealStep}
                selectedCardId={selectedCardId}
                onSlotClick={handleSlotClick}
                placementActive={placementActive}
                selectedAiCardId={selectedAiCardId}
                onAiCardClick={handleAiCardClick}
                onAiSlotClick={handleAiSlotClick}
                onAiSwapCard={(cardId, newType) =>
                  dispatch({ type: 'DEV_SWAP_HAND_CARD', owner: 'ai', cardId, newType })
                }
                aiStackCount={aiStack.length}
                playerDiscardCount={playerDiscard.length}
                aiDiscardCount={aiDiscard.length}
                dragonOverlayOwner={dragonOverlayOwner}
                pendingCascade={pendingCascade}
                cascadeFightIndex={cascadeFightIndex}
                devMode={devMode}
                aiStack={aiStack}
                canEditStacks={canShuffle}
                onStackSwapCard={(cardId, newType) =>
                  dispatch({ type: 'DEV_SWAP_STACK_CARD', owner: 'ai', cardId, newType })
                }
                registerRef={registerRef}
              />
              {/* [Layout — Drift-Proof Hand Row] Three regions instead of a
                  single centered flex group: a spacer on the left, Hand in
                  the middle (always centered on the ROW's midpoint — see
                  App.module.css's .app-hand-row doc comment), and a region
                  on the right that pins PlayerStackControls flush against
                  the row's own right edge via justify-content: flex-end. */}
              <div className={styles['app-hand-row']}>
                {/* [Layout — Hand Row Symmetric Ghost]
                    Mirrors PlayerStackControls' actual rendered footprint
                    (card pile + Shuffle button, stacked in a column) on the
                    LEFT side of Hand. Previously an empty div: both sides
                    are flex:1, so the free space itself still split evenly
                    — but PlayerStackControls' own real content width on the
                    right stacked on TOP of that equal share, making the
                    right side wider than the left by that fixed amount.
                    That silently pulled Hand off the row's true midpoint by
                    the same fixed number of pixels regardless of hand size
                    — invisible against a full 5-card hand's own width, but
                    very visible once the hand shrank to 1-2 cards (see bug
                    report: "hand moves closer as cards are played").
                    Invisible/inert (visibility:hidden + pointer-events:none),
                    same technique as Board.module.css's
                    .stack-col-wrap__ghost — a real structural clone rather
                    than a guessed pixel width, so it stays correct
                    automatically if CardPile or the Shuffle button's own
                    size ever changes. count=3 forces full depth-stack
                    rendering to match the real pile's widest/tallest state;
                    showLabel={false} mirrors the real pile's now-hidden
                    "You" caption exactly. */}
                <div className={styles['app-hand-row__side']} aria-hidden="true">
                  <div
                    className={boardStyles['stack-col-wrap']}
                    style={{ visibility: 'hidden', pointerEvents: 'none' }}
                  >
                    <CardPile count={3} label="You" variant="stack" showLabel={false} />
                    <button className={boardStyles['stack-col__shuffle']}>⇄ Shuffle</button>
                  </div>
                </div>
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
                <div className={clsx(styles['app-hand-row__side'], styles['app-hand-row__side--right'])}>
                  <PlayerStackControls
                    count={playerStack.length}
                    onShuffleStack={handleShuffleStack}
                    canShuffle={canShuffle}
                    devMode={devMode}
                    playerStack={playerStack}
                    canEditStacks={canShuffle}
                    onSwapCard={(cardId, newType) =>
                      dispatch({ type: 'DEV_SWAP_STACK_CARD', owner: 'player', cardId, newType })
                    }
                    registerRef={registerRef}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* [SUB-BLOCK: Right-Edge Spacer — Global Centering Fix]
            Mirrors .left-sidebar's exact footprint (200px + 14px margin
            each side = 228px) on the opposite edge of .app-shell, so
            app-center's remaining flex space is symmetric and its own
            internal centering lines up with the page's true center
            instead of the sidebar-skewed leftover space. Purely
            structural — no content, never interactive. See
            App.module.css's .app-shell__spacer doc comment. */}
        <div className={styles['app-shell__spacer']} aria-hidden="true" />

      </div>

      <CardFlightOverlay flights={flights} durationMs={RETURN_FLIGHT_MS} />
    </>
  );
}

export default App;