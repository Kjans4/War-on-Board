// src/state/useGameState.ts

import { useReducer } from 'react';
import type {
  GameState,
  Card,
  SlotKey,
  BoardSlots,
  AIDifficulty,
  RoundHistoryEntry,
} from '../types/game';
import {
  HAND_SIZE,
  CARDS_TO_PLACE,
  TOTAL_ROUNDS,
  SLOT_KEYS,
} from '../types/game';
import { createShuffledDeck, drawToFill, shuffleStack } from '../logic/deck';
import {
  resolveRound,
  getSurvivors,
  resolveCascade,
  roundHasDragon,
  getCascadeRoundWinner,
  getDragonInfo,
} from '../logic/combat';

// [BLOCK: Initial State Helpers]
function makeEmptySlots(): BoardSlots {
  return {
    left:   { key: 'left',   card: null, state: 'empty' },
    center: { key: 'center', card: null, state: 'empty' },
    right:  { key: 'right',  card: null, state: 'empty' },
  };
}

function makeInitialState(difficulty: AIDifficulty = 'random'): GameState {
  const playerStack = createShuffledDeck('player');
  const aiStack = createShuffledDeck('ai');

  return {
    round: 1,
    phase: 'draw',

    playerStack,
    playerHand: [],
    playerSlots: makeEmptySlots(),

    aiStack,
    aiHand: [],
    aiSlots: makeEmptySlots(),

    ai: {
      difficulty,
      patternHistory: { left: [], center: [], right: [] },
      playerCardsSeen: { Sword: 0, Arrow: 0, Shield: 0 },
      confidenceDisrupted: false,
    },

    roundHistory: [],
    pendingResolution: null,
    pendingCascade: null,
    devMode: false,
    result: null,
  };
}

// [BLOCK: Action Types]
// AI_PLACE_CARDS and CONFIRM_PLACEMENT replace the old single
// 'PLACE_AI_CARDS' action. Splitting them lets the AI fill its slots
// automatically (via a timer in App.tsx) while phase stays 'placement' —
// the phase only advances to 'reveal' once the player explicitly confirms,
// and only once both sides have placed (see CONFIRM_PLACEMENT below).
//
// AI_PLACE_SINGLE_CARD and AI_REMOVE_CARD are Dev Test Mode-only additions
// (see dev-test-mode-plan.md) — they let Django manually recall one of the
// AI's already-placed cards back to its hand, then manually place a
// (possibly different) card from that same hand into the now-empty slot.
// Both are gated on state.devMode in the reducer itself, not just hidden in
// the UI, so they can never affect normal play even if mis-dispatched.
export type GameAction =
  | { type: 'DRAW_CARDS' }
  | { type: 'PLACE_CARD'; slotKey: SlotKey; card: Card }
  | { type: 'REMOVE_CARD'; slotKey: SlotKey }
  | { type: 'AI_PLACE_CARDS'; placements: Record<SlotKey, Card> }
  | { type: 'AI_PLACE_SINGLE_CARD'; slotKey: SlotKey; card: Card }
  | { type: 'AI_REMOVE_CARD'; slotKey: SlotKey }
  | { type: 'CONFIRM_PLACEMENT' }
  | { type: 'REVEAL_ROUND' }
  | { type: 'RECORD_HISTORY' }
  | { type: 'NEXT_ROUND' }
  | { type: 'SHUFFLE_STACK' }
  | { type: 'SET_DIFFICULTY'; difficulty: AIDifficulty }
  | { type: 'SET_DEV_MODE'; devMode: boolean }
  | { type: 'RESTART' };

// [BLOCK: Validation Helpers]
function allSlotsPlaced(slots: BoardSlots): boolean {
  return SLOT_KEYS.every((k) => slots[k].card !== null);
}

function countCards(state: GameState, owner: 'player' | 'ai'): number {
  if (owner === 'player') {
    return state.playerStack.length + state.playerHand.length;
  }
  return state.aiStack.length + state.aiHand.length;
}

// [BLOCK: Reducer]
function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {

    // -- Draw cards from stack to fill hand to 5
    case 'DRAW_CARDS': {
      if (state.phase !== 'draw') return state;

      const { hand: playerHand, stack: playerStack } = drawToFill(
        state.playerHand,
        state.playerStack,
        HAND_SIZE
      );
      const { hand: aiHand, stack: aiStack } = drawToFill(
        state.aiHand,
        state.aiStack,
        HAND_SIZE
      );

      return {
        ...state,
        playerHand,
        playerStack,
        aiHand,
        aiStack,
        phase: 'placement',
      };
    }

    // -- Player places a card into a slot (face-down)
    case 'PLACE_CARD': {
      if (state.phase !== 'placement') return state;

      const { slotKey, card } = action;
      const alreadyPlaced = SLOT_KEYS.filter(
        (k) => state.playerSlots[k].card !== null
      ).length;

      if (alreadyPlaced >= CARDS_TO_PLACE) return state;
      if (state.playerSlots[slotKey].card !== null) return state;

      return {
        ...state,
        playerHand: state.playerHand.filter((c) => c.id !== card.id),
        playerSlots: {
          ...state.playerSlots,
          [slotKey]: { key: slotKey, card, state: 'placed' },
        },
      };
    }

    // -- Player removes a card from a slot back to hand
    case 'REMOVE_CARD': {
      if (state.phase !== 'placement') return state;

      const { slotKey } = action;
      const slot = state.playerSlots[slotKey];
      if (!slot.card) return state;

      return {
        ...state,
        playerHand: [...state.playerHand, slot.card],
        playerSlots: {
          ...state.playerSlots,
          [slotKey]: { key: slotKey, card: null, state: 'empty' },
        },
      };
    }

    // -- AI places its 3 cards automatically, fired by App.tsx's 2s
    //    placement timer (not by the player's Play click). Fills aiSlots
    //    only — phase stays 'placement' so the player can keep
    //    placing/re-placing their own cards up until they hit Play.
    //    Guarded on NO aiSlot having a card yet (rather than "not all 3
    //    filled") so that if Dev Test Mode manually places a card into an
    //    AI slot before the 2s timer fires, this won't overwrite it with a
    //    stale placements object computed from the pre-manual-edit hand.
    case 'AI_PLACE_CARDS': {
      if (state.phase !== 'placement') return state;
      if (SLOT_KEYS.some((k) => state.aiSlots[k].card !== null)) return state;

      const { placements } = action;
      const aiSlots: BoardSlots = { ...state.aiSlots };

      for (const key of SLOT_KEYS) {
        aiSlots[key] = { key, card: placements[key], state: 'placed' };
      }

      const aiHand = state.aiHand.filter(
        (c) => !Object.values(placements).find((p) => p.id === c.id)
      );

      return {
        ...state,
        aiHand,
        aiSlots,
      };
    }

    // -- [Dev Test Mode] Manually place one card from the AI's hand into
    //    one empty AI slot. Dev-only (see dev-test-mode-plan.md) — used
    //    after AI_REMOVE_CARD recalls a slot, or to fill a slot the 2s
    //    auto-placement timer hasn't reached yet. Does not touch phase;
    //    App.tsx's canConfirm still requires all 3 AI slots filled before
    //    Play unlocks, so this alone never skips ahead.
    case 'AI_PLACE_SINGLE_CARD': {
      if (!state.devMode) return state;
      if (state.phase !== 'placement') return state;

      const { slotKey, card } = action;
      if (state.aiSlots[slotKey].card !== null) return state;
      if (!state.aiHand.find((c) => c.id === card.id)) return state;

      return {
        ...state,
        aiHand: state.aiHand.filter((c) => c.id !== card.id),
        aiSlots: {
          ...state.aiSlots,
          [slotKey]: { key: slotKey, card, state: 'placed' },
        },
      };
    }

    // -- [Dev Test Mode] Recall a single AI-placed card back to the AI's
    //    hand. Dev-only, placement-phase-only. Per design discussion: this
    //    never triggers a re-fill — the 2s auto-placement timer (App.tsx)
    //    only ever fires once per round (guarded there), so the slot stays
    //    empty until AI_PLACE_SINGLE_CARD manually fills it. This also
    //    correctly re-locks Play, since canConfirm requires all 3 AI slots
    //    filled.
    case 'AI_REMOVE_CARD': {
      if (!state.devMode) return state;
      if (state.phase !== 'placement') return state;

      const { slotKey } = action;
      const slot = state.aiSlots[slotKey];
      if (!slot.card) return state;

      return {
        ...state,
        aiHand: [...state.aiHand, slot.card],
        aiSlots: {
          ...state.aiSlots,
          [slotKey]: { key: slotKey, card: null, state: 'empty' },
        },
      };
    }

    // -- Player confirms placement (Play button). Only reachable once both
    //    the player's 3 slots AND the AI's 3 slots are filled — App.tsx's
    //    canConfirm gates the button itself, this is the reducer-side
    //    guard. Advances phase to 'reveal', which kicks off the reveal
    //    animation effect in App.tsx.
    case 'CONFIRM_PLACEMENT': {
      if (state.phase !== 'placement') return state;
      if (!allSlotsPlaced(state.playerSlots)) return state;
      if (!allSlotsPlaced(state.aiSlots)) return state;

      return {
        ...state,
        phase: 'reveal',
      };
    }

    // -- Resolve all 3 slots (single source of truth for this round's lane
    //    outcomes), then run the cascade on top of that same resolution
    //    (single source of truth for the round's cascade outcome too).
    //    Both are stored in pendingResolution / pendingCascade rather than
    //    recomputed later — resolveSlot() mutates card.exhausted in place,
    //    both for lane resolution AND for cascade fights, so re-running
    //    either a second time on the same card objects would corrupt
    //    already-exhausted pairs (see GameState.pendingResolution /
    //    pendingCascade doc comments in types/game.ts).
    //    History is recorded later via RECORD_HISTORY so it doesn't spoil
    //    the reveal animation; survivor cycling happens later via
    //    NEXT_ROUND.
    case 'REVEAL_ROUND': {
      if (state.phase !== 'reveal') return state;
      if (!allSlotsPlaced(state.playerSlots)) return state;
      if (!allSlotsPlaced(state.aiSlots)) return state;

      const resolution = resolveRound(state.playerSlots, state.aiSlots);
      const dragonPlayed = roundHasDragon(resolution);
      const cascade = resolveCascade(resolution, dragonPlayed);

      // Apply raw lane outcomes to slot states first...
      const playerSlots: BoardSlots = { ...state.playerSlots };
      const aiSlots: BoardSlots = { ...state.aiSlots };

      for (const key of SLOT_KEYS) {
        const { player, ai } = resolution[key];
        playerSlots[key] = { ...playerSlots[key], state: player };
        aiSlots[key] = { ...aiSlots[key], state: ai };
      }

      // ...then flip any cascade losers on top — 'cascaded' rather than
      // plain 'lost', so the UI can distinguish "won this lane's RPS
      // matchup but got cut down in the cascade" from "lost the lane
      // outright." Mechanically identical to 'lost' for scoring/survivor
      // cycling (see getSurvivors in combat.ts — 'cascaded' is not 'won'
      // or 'tied', so it's excluded from survivors same as 'lost' always
      // was). (No-op on Dragon rounds — resolveCascade never triggers for
      // them.)
      for (const o of cascade.overrides) {
        if (o.owner === 'player') {
          playerSlots[o.slotKey] = { ...playerSlots[o.slotKey], state: 'cascaded' };
        } else {
          aiSlots[o.slotKey] = { ...aiSlots[o.slotKey], state: 'cascaded' };
        }
      }

      // Update Smart AI pattern tracking — Dragon plays are excluded
      // (ai-behavior.md defines no pattern behavior for it; patternHistory
      // is typed to RPS types only, see types/game.ts). This tracks what
      // the player PLACED, not the cascade outcome, so it's unaffected by
      // cascade fights.
      const patternHistory = { ...state.ai.patternHistory };
      if (state.ai.difficulty === 'smart' && !state.ai.confidenceDisrupted) {
        for (const key of SLOT_KEYS) {
          const playedType = state.playerSlots[key].card!.type;
          if (playedType !== 'Dragon') {
            patternHistory[key] = [...patternHistory[key], playedType];
          }
        }
      }

      // Update cards seen by AI — Dragon excluded (single-use, untracked;
      // see ai-behavior.md and ai.ts).
      const playerCardsSeen = { ...state.ai.playerCardsSeen };
      for (const key of SLOT_KEYS) {
        const playedType = state.playerSlots[key].card!.type;
        if (playedType !== 'Dragon') {
          playerCardsSeen[playedType]++;
        }
      }

      return {
        ...state,
        playerSlots,
        aiSlots,
        pendingResolution: resolution,
        pendingCascade: cascade,
        ai: {
          ...state.ai,
          patternHistory,
          playerCardsSeen,
          confidenceDisrupted: false,
        },
        phase: 'resolution',
      };
    }

    // -- Build and push the round history entry, using the resolution and
    //    cascade already computed by REVEAL_ROUND (not recomputed).
    //    Deferred until after the reveal animation plays so history
    //    doesn't spoil outcomes early (see ROADMAP.md history-timing note).
    //    The stored `resolutions` reflect the POST-cascade outcome (any
    //    cascade-overridden lane reads as 'cascaded', not the raw 'won'
    //    resolveRound() originally gave it) — this was a display gap
    //    before: history used to show a cascaded-away lane as a plain
    //    "Win" even though the card was actually discarded.
    case 'RECORD_HISTORY': {
      if (!state.pendingResolution) return state;

      const resolution = state.pendingResolution;
      const cascade = state.pendingCascade;
      const dragonInfo = getDragonInfo(resolution);

      const cascadedPlayerSlots = new Set(
        (cascade?.overrides ?? []).filter((o) => o.owner === 'player').map((o) => o.slotKey)
      );
      const cascadedAiSlots = new Set(
        (cascade?.overrides ?? []).filter((o) => o.owner === 'ai').map((o) => o.slotKey)
      );

      const historyEntry: RoundHistoryEntry = {
        round: state.round,
        playerSlots: {
          left:   state.playerSlots.left.card!.type,
          center: state.playerSlots.center.card!.type,
          right:  state.playerSlots.right.card!.type,
        },
        aiSlots: {
          left:   state.aiSlots.left.card!.type,
          center: state.aiSlots.center.card!.type,
          right:  state.aiSlots.right.card!.type,
        },
        resolutions: {
          left: {
            player: cascadedPlayerSlots.has('left') ? 'cascaded' : resolution.left.player,
            ai:     cascadedAiSlots.has('left')     ? 'cascaded' : resolution.left.ai,
          },
          center: {
            player: cascadedPlayerSlots.has('center') ? 'cascaded' : resolution.center.player,
            ai:     cascadedAiSlots.has('center')     ? 'cascaded' : resolution.center.ai,
          },
          right: {
            player: cascadedPlayerSlots.has('right') ? 'cascaded' : resolution.right.player,
            ai:     cascadedAiSlots.has('right')     ? 'cascaded' : resolution.right.ai,
          },
        },
        playerCardsAfter: countCards(state, 'player'),
        aiCardsAfter: countCards(state, 'ai'),
        cascade: cascade
          ? {
              triggered: cascade.triggered,
              log: cascade.log,
              survivingSlots: cascade.survivingSlots,
              roundWinner: getCascadeRoundWinner(cascade),
            }
          : null,
        dragonSide: dragonInfo?.side ?? null,
        dragonSlot: dragonInfo?.slotKey ?? null,
      };

      return {
        ...state,
        roundHistory: [...state.roundHistory, historyEntry],
      };
    }

    // -- Cycle survivors to stack bottom, reset slots, advance round.
    //    Uses the stored resolution from REVEAL_ROUND (not a fresh
    //    resolveRound() call — see GameState.pendingResolution), then
    //    strips out any card the cascade discarded on top of that.
    case 'NEXT_ROUND': {
      if (state.phase !== 'resolution') return state;
      if (!state.pendingResolution) return state;

      const { playerSurvivors, aiSurvivors } = getSurvivors(state.pendingResolution);

      let finalPlayerSurvivors = playerSurvivors;
      let finalAiSurvivors = aiSurvivors;

      if (state.pendingCascade) {
        const resolution = state.pendingResolution;
        const overriddenPlayerIds = new Set(
          state.pendingCascade.overrides
            .filter((o) => o.owner === 'player')
            .map((o) => resolution[o.slotKey].playerCard.id)
        );
        const overriddenAiIds = new Set(
          state.pendingCascade.overrides
            .filter((o) => o.owner === 'ai')
            .map((o) => resolution[o.slotKey].aiCard.id)
        );

        finalPlayerSurvivors = playerSurvivors.filter((c) => !overriddenPlayerIds.has(c.id));
        finalAiSurvivors = aiSurvivors.filter((c) => !overriddenAiIds.has(c.id));
      }

      const playerStack = [...state.playerStack, ...finalPlayerSurvivors];
      const aiStack = [...state.aiStack, ...finalAiSurvivors];

      const nextRound = state.round + 1;
      const isGameOver = nextRound > TOTAL_ROUNDS;

      // Calculate result if game is over
      let result: GameState['result'] = null;
      if (isGameOver) {
        const playerScore = playerStack.length + state.playerHand.length;
        const aiScore = aiStack.length + state.aiHand.length;
        result = playerScore > aiScore ? 'player' : aiScore > playerScore ? 'ai' : 'draw';
      }

      return {
        ...state,
        round: nextRound,
        phase: isGameOver ? 'gameover' : 'draw',
        playerStack,
        playerHand: state.playerHand,
        playerSlots: makeEmptySlots(),
        aiStack,
        aiHand: state.aiHand,
        aiSlots: makeEmptySlots(),
        pendingResolution: null,
        pendingCascade: null,
        result,
      };
    }

    // -- Player shuffles their stack (breaks Smart AI confidence)
    case 'SHUFFLE_STACK': {
      if (state.phase === 'reveal' || state.phase === 'gameover') return state;

      return {
        ...state,
        playerStack: shuffleStack(state.playerStack),
        ai: {
          ...state.ai,
          confidenceDisrupted: true,
        },
      };
    }

    // -- Change AI difficulty (takes effect next round)
    case 'SET_DIFFICULTY': {
      return {
        ...state,
        ai: {
          ...state.ai,
          difficulty: action.difficulty,
        },
      };
    }

    // -- Toggle Dev Test Mode (Phase 1: reveals the AI's hand; later phases
    //    add stack inspection + hand editing). Does not affect AI placement
    //    logic — see dev-test-mode-plan.md.
    case 'SET_DEV_MODE': {
      return {
        ...state,
        devMode: action.devMode,
      };
    }

    // -- Restart the game entirely
    case 'RESTART': {
      return makeInitialState(state.ai.difficulty);
    }

    default:
      return state;
  }
}

// [BLOCK: Hook]
export function useGameState(initialDifficulty: AIDifficulty = 'random') {
  const [state, dispatch] = useReducer(gameReducer, undefined, () =>
    makeInitialState(initialDifficulty)
  );

  return { state, dispatch };
}