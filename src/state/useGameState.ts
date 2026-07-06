// src/state/useGameState.ts

import { useReducer } from 'react';
import type {
  GameState,
  Card,
  SlotKey,
  BoardSlots,
  AIDifficulty,
  RoundHistoryEntry,
  RoundResolution,
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
    playerDiscard: [],
    aiDiscard: [],
    pendingResolution: null,
    pendingCascade: null,
    devMode: false,
    result: null,
  };
}

// [BLOCK: Action Types]
export type GameAction =
  | { type: 'DRAW_CARDS' }
  | { type: 'PLACE_CARD'; slotKey: SlotKey; card: Card }
  | { type: 'REMOVE_CARD'; slotKey: SlotKey }
  | { type: 'PLACE_AI_CARDS'; placements: Record<SlotKey, Card> }
  | { type: 'START_REVEAL' }
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

    // -- AI places its 3 cards. Now fires on its own ~2s-after-round-start
    //    timer (see App.tsx) rather than only in response to the player's
    //    confirm click — so it no longer requires the player's slots to be
    //    filled, and no longer advances phase itself. Guarded against
    //    double-firing for a round that's already placed (defensive; the
    //    timer that dispatches this already guards per-round via a ref).
    case 'PLACE_AI_CARDS': {
      if (state.phase !== 'placement') return state;
      if (allSlotsPlaced(state.aiSlots)) return state;

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

    // -- Advances placement -> reveal. Split out from PLACE_AI_CARDS (which
    //    used to do both) now that the AI places on its own timer instead
    //    of in response to this moment — this is the player's Play click,
    //    gated on BOTH sides having placed (App.tsx's canConfirm mirrors
    //    this same double-check to keep the button disabled until the AI
    //    has actually placed).
    case 'START_REVEAL': {
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

      // [SUB-BLOCK: Cascade Relabeling]
      // resolveCascade() above still reads the RAW resolution — it needs
      // 'won' labels intact to find lane-winners via collectWonEntries —
      // so this relabeling happens strictly AFTER that call, never before.
      // Any lane a cascade fight overrode gets its outcome flipped from
      // 'won' to 'cascaded': mechanically identical to 'lost' for survivor
      // cycling (see combat.ts's getSurvivors, which only ever counts
      // 'won'/'tied'), but reads correctly as "won its matchup, then fell
      // in the cascade" rather than a plain loss (see types/game.ts's
      // CombatOutcome doc comment). This relabeled object becomes the
      // SINGLE version of this round's resolution from here on — stored in
      // pendingResolution and read by RECORD_HISTORY, NEXT_ROUND, and
      // App.tsx's return-flight builder alike, so none of them need to
      // separately cross-reference cascade.overrides anymore.
      const cascadedPlayerKeys = new Set(
        cascade.overrides.filter((o) => o.owner === 'player').map((o) => o.slotKey)
      );
      const cascadedAiKeys = new Set(
        cascade.overrides.filter((o) => o.owner === 'ai').map((o) => o.slotKey)
      );

      const resolvedWithCascade: RoundResolution = { ...resolution };
      for (const key of SLOT_KEYS) {
        const r = resolution[key];
        resolvedWithCascade[key] = {
          ...r,
          player: cascadedPlayerKeys.has(key) ? 'cascaded' : r.player,
          ai: cascadedAiKeys.has(key) ? 'cascaded' : r.ai,
        };
      }

      // Apply the (now cascade-aware) lane outcomes to slot states.
      const playerSlots: BoardSlots = { ...state.playerSlots };
      const aiSlots: BoardSlots = { ...state.aiSlots };

      for (const key of SLOT_KEYS) {
        const { player, ai } = resolvedWithCascade[key];
        playerSlots[key] = { ...playerSlots[key], state: player };
        aiSlots[key] = { ...aiSlots[key], state: ai };
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
        pendingResolution: resolvedWithCascade,
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
    case 'RECORD_HISTORY': {
      if (!state.pendingResolution) return state;

      const resolution = state.pendingResolution;
      const cascade = state.pendingCascade;
      const dragonInfo = getDragonInfo(resolution);

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
          left:   { player: resolution.left.player,   ai: resolution.left.ai },
          center: { player: resolution.center.player, ai: resolution.center.ai },
          right:  { player: resolution.right.player,  ai: resolution.right.ai },
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

    // -- Cycle survivors to stack bottom, route everyone else to that
    //    side's discard pile, reset slots, advance round.
    //    Uses the stored resolution from REVEAL_ROUND (not a fresh
    //    resolveRound() call — see GameState.pendingResolution), then
    //    strips out any card the cascade discarded on top of that.
    case 'NEXT_ROUND': {
      if (state.phase !== 'resolution') return state;
      if (!state.pendingResolution) return state;

      // getSurvivors() only ever counts 'won'/'tied' outcomes. Since
      // pendingResolution is now the cascade-relabeled version built in
      // REVEAL_ROUND's Cascade Relabeling sub-block, any lane a cascade
      // fight overrode already reads 'cascaded' here, not 'won' — so it's
      // excluded automatically, with no separate cross-reference against
      // pendingCascade.overrides needed anymore.
      const resolution = state.pendingResolution;
      const {
        playerSurvivors: finalPlayerSurvivors,
        aiSurvivors: finalAiSurvivors,
      } = getSurvivors(resolution);

      // [SUB-BLOCK: Discard routing]
      // Everything that was placed this round but isn't a final survivor
      // goes to that side's discard pile — covers lost, tied-lost, dragon,
      // and cascade-overridden won cards in one pass, without touching
      // combat/survivor logic above. Purely presentational bookkeeping
      // (see GameState.playerDiscard/aiDiscard doc comment).
      const placedPlayerCards = SLOT_KEYS.map((k) => resolution[k].playerCard);
      const placedAiCards = SLOT_KEYS.map((k) => resolution[k].aiCard);

      const survivorPlayerIds = new Set(finalPlayerSurvivors.map((c) => c.id));
      const survivorAiIds = new Set(finalAiSurvivors.map((c) => c.id));

      const newPlayerDiscards = placedPlayerCards.filter((c) => !survivorPlayerIds.has(c.id));
      const newAiDiscards = placedAiCards.filter((c) => !survivorAiIds.has(c.id));

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
        playerDiscard: [...state.playerDiscard, ...newPlayerDiscards],
        aiDiscard: [...state.aiDiscard, ...newAiDiscards],
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