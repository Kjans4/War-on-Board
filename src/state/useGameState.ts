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
import { resolveRound, getSurvivors } from '../logic/combat';

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
    result: null,
  };
}

// [BLOCK: Action Types]
export type GameAction =
  | { type: 'DRAW_CARDS' }
  | { type: 'PLACE_CARD'; slotKey: SlotKey; card: Card }
  | { type: 'REMOVE_CARD'; slotKey: SlotKey }
  | { type: 'PLACE_AI_CARDS'; placements: Record<SlotKey, Card> }
  | { type: 'REVEAL_ROUND' }
  | { type: 'NEXT_ROUND' }
  | { type: 'SHUFFLE_STACK' }
  | { type: 'SET_DIFFICULTY'; difficulty: AIDifficulty }
  | { type: 'RESTART' };

// [BLOCK: Validation Helpers]
function allSlotsPlaced(slots: BoardSlots): boolean {
  return SLOT_KEYS.every((k) => slots[k].card !== null);
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

    // -- AI places its 3 cards (called after player confirms placement)
    case 'PLACE_AI_CARDS': {
      if (state.phase !== 'placement') return state;
      if (!allSlotsPlaced(state.playerSlots)) return state;

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
        phase: 'reveal',
      };
    }

    // -- Resolve all 3 slots, update slot states
    case 'REVEAL_ROUND': {
      if (state.phase !== 'reveal') return state;
      if (!allSlotsPlaced(state.playerSlots)) return state;
      if (!allSlotsPlaced(state.aiSlots)) return state;

      const resolution = resolveRound(state.playerSlots, state.aiSlots);

      // Update slot states to reflect outcomes
      const playerSlots: BoardSlots = { ...state.playerSlots };
      const aiSlots: BoardSlots = { ...state.aiSlots };

      for (const key of SLOT_KEYS) {
        const { player, ai } = resolution[key];
        playerSlots[key] = { ...playerSlots[key], state: player };
        aiSlots[key] = { ...aiSlots[key], state: ai };
      }

      // Update Smart AI pattern tracking
      const patternHistory = { ...state.ai.patternHistory };
      if (state.ai.difficulty === 'smart' && !state.ai.confidenceDisrupted) {
        for (const key of SLOT_KEYS) {
          patternHistory[key] = [
            ...patternHistory[key],
            state.playerSlots[key].card!.type,
          ];
        }
      }

      // Update cards seen by AI
      const playerCardsSeen = { ...state.ai.playerCardsSeen };
      for (const key of SLOT_KEYS) {
        playerCardsSeen[state.playerSlots[key].card!.type]++;
      }

      return {
        ...state,
        playerSlots,
        aiSlots,
        ai: {
          ...state.ai,
          patternHistory,
          playerCardsSeen,
          confidenceDisrupted: false,
        },
        phase: 'resolution',
      };
    }

    // -- Cycle survivors to stack bottom, reset slots, advance round
    case 'NEXT_ROUND': {
      if (state.phase !== 'resolution') return state;

      const resolution = resolveRound(state.playerSlots, state.aiSlots);
      const { playerSurvivors, aiSurvivors } = getSurvivors(resolution);

      const playerStack = [...state.playerStack, ...playerSurvivors];
      const aiStack = [...state.aiStack, ...aiSurvivors];

      const nextRound = state.round + 1;
      const isGameOver = nextRound > TOTAL_ROUNDS;

      // Calculate result if game is over
      let result: GameState['result'] = null;
      if (isGameOver) {
        const playerScore = playerStack.length + state.playerHand.length;
        const aiScore = aiStack.length + state.aiHand.length;
        result = playerScore > aiScore ? 'player' : aiScore > playerScore ? 'ai' : 'draw';
      }

      // [BLOCK: History Entry]
      // Recorded here (not in REVEAL_ROUND) so the round history panel only
      // updates after the full reveal animation has played and the player has
      // clicked Play to advance — prevents the history from spoiling outcomes
      // before cards are visually revealed on the battlefield.
      // Card counts use post-cycling stack lengths so they reflect what the
      // next round actually starts with.
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
        playerCardsAfter: playerStack.length + state.playerHand.length,
        aiCardsAfter: aiStack.length + state.aiHand.length,
      };

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
        roundHistory: [...state.roundHistory, historyEntry],
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