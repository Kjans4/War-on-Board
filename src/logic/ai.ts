// src/logic/ai.ts

import type { Card, SlotKey, AIState } from '../types/game';
import { SLOT_KEYS, CARDS_TO_PLACE } from '../types/game';
import { shuffle } from './deck';

// [BLOCK: Random AI]
// Selects 3 cards from hand at random, assigns to slots in random order.
// No memory, no pattern recognition.
export function randomAIPlacement(hand: Card[]): Record<SlotKey, Card> {
  const shuffledHand = shuffle([...hand]);
  const picked = shuffledHand.slice(0, CARDS_TO_PLACE);
  const shuffledSlots = shuffle([...SLOT_KEYS]);

  return {
    [shuffledSlots[0]]: picked[0],
    [shuffledSlots[1]]: picked[1],
    [shuffledSlots[2]]: picked[2],
  } as Record<SlotKey, Card>;
}

// [BLOCK: AI Placement Entry Point]
// Routes to the correct placement strategy based on difficulty.
// Smart AI will be wired in here during Phase 3.
export function getAIPlacement(
  hand: Card[],
  aiState: AIState
): Record<SlotKey, Card> {
  switch (aiState.difficulty) {
    case 'smart':
      // TODO Phase 3: replace with smartAIPlacement(hand, aiState)
      return randomAIPlacement(hand);
    case 'random':
    default:
      return randomAIPlacement(hand);
  }
}