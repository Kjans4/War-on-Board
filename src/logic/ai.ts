// src/logic/ai.ts

import type { Card, SlotKey, AIState, RPSType, PatternHistory, CardsSeen } from '../types/game';
import { SLOT_KEYS, CARDS_TO_PLACE, CARDS_PER_TYPE, RPS_TYPES } from '../types/game';
import { shuffle } from './deck';

// [BLOCK: Random AI]
// Selects cards from hand at random, assigns to slots in random order.
// No memory, no pattern recognition. Dragon is just another card in hand
// here — Random AI has no concept of "saving" it.
//
// [Dev Test Mode] slotsToFill lets a caller ask for only a SUBSET of the 3
// slots — needed because in Dev Test Mode the tester may have already
// manually claimed one or two AI slots before this fires (see App.tsx's AI
// placement timer, which computes the still-empty slots at fire-time and
// passes only those in). Defaults to all 3 slots for normal play, where
// nothing has been manually claimed yet.
export function randomAIPlacement(
  hand: Card[],
  slotsToFill: SlotKey[] = SLOT_KEYS
): Partial<Record<SlotKey, Card>> {
  const shuffledHand = shuffle([...hand]);
  const picked = shuffledHand.slice(0, slotsToFill.length);
  const shuffledSlots = shuffle([...slotsToFill]);

  const placement: Partial<Record<SlotKey, Card>> = {};
  shuffledSlots.forEach((slotKey, i) => {
    if (picked[i]) placement[slotKey] = picked[i];
  });

  return placement;
}

// [BLOCK: RPS Counter Lookup]
// Dragon has no counter — it's outside the RPS triangle and is resolved as
// a whole-round override in combat.ts, not through counter-selection here.
const COUNTERS: Record<RPSType, RPSType> = {
  Sword: 'Shield',
  Arrow: 'Sword',
  Shield: 'Arrow',
};

export function getCounter(type: RPSType): RPSType {
  return COUNTERS[type];
}

// [BLOCK: Slot Pattern Prediction]
// Per ai-behavior.md "Slot Pattern History" — after 2+ rounds, predicts the
// player's most frequent type in a given slot. Only ever sees RPS types:
// Dragon plays are filtered out before being recorded into patternHistory
// (see useGameState.ts's REVEAL_ROUND case), since ai-behavior.md doesn't
// define any pattern behavior for it.
const MIN_ROUNDS_FOR_PREDICTION = 2;

export function predictSlotType(
  patternHistory: PatternHistory,
  slotKey: SlotKey
): RPSType | null {
  const history = patternHistory[slotKey];
  if (history.length < MIN_ROUNDS_FOR_PREDICTION) return null;

  const counts: Record<RPSType, number> = { Sword: 0, Arrow: 0, Shield: 0 };
  for (const type of history) counts[type]++;

  let best: RPSType | null = null;
  let bestCount = 0;
  for (const type of RPS_TYPES) {
    if (counts[type] > bestCount) {
      best = type;
      bestCount = counts[type];
    }
  }

  return best;
}

// [BLOCK: Confidence Curve]
// Resolves Open Design Question #2 (ROADMAP.md). Confidence determines how
// strongly the AI commits to its slot prediction vs. playing more loosely.
//   - Rounds 1-2: 0 (near-random — not enough data)
//   - Rounds 3-5: scales linearly 0.4 -> 0.7
//   - Rounds 6-7: 0.85 (peak, intentionally not perfect)
// A disrupted round (post-shuffle) always forces confidence to 0.
export function getSlotConfidence(round: number, confidenceDisrupted: boolean): number {
  if (confidenceDisrupted) return 0;
  if (round <= 2) return 0;
  if (round <= 5) {
    const t = (round - 3) / 2; // 0 at round 3, 1 at round 5
    return 0.4 + t * 0.3;
  }
  return 0.85;
}

// [BLOCK: Card Economy Tracking]
// Per ai-behavior.md "Card Economy Tracking" — RPS types only. Dragon is a
// single-use, once-per-match card with no documented economy behavior, so
// it's excluded here the same way it's excluded from patternHistory.
export function getRemainingCounts(playerCardsSeen: CardsSeen): CardsSeen {
  const remaining = {} as CardsSeen;
  for (const type of RPS_TYPES) {
    remaining[type] = Math.max(0, CARDS_PER_TYPE - playerCardsSeen[type]);
  }
  return remaining;
}

// Returns the type(s) the player is running low on. Used to deprioritize
// countering a type the player is unlikely to still have in hand.
export function getScarceTypes(
  playerCardsSeen: CardsSeen,
  threshold: number = 1
): RPSType[] {
  const remaining = getRemainingCounts(playerCardsSeen);
  return RPS_TYPES.filter((type) => remaining[type] <= threshold);
}

// [BLOCK: AI Placement Entry Point]
// Routes to the correct placement strategy based on difficulty.
// slotsToFill: see randomAIPlacement's doc comment — defaults to all 3.
export function getAIPlacement(
  hand: Card[],
  aiState: AIState,
  round: number,
  slotsToFill: SlotKey[] = SLOT_KEYS
): Partial<Record<SlotKey, Card>> {
  switch (aiState.difficulty) {
    case 'smart':
      return smartAIPlacement(hand, aiState, round, slotsToFill);
    case 'random':
    default:
      return randomAIPlacement(hand, slotsToFill);
  }
}

// [BLOCK: Global Tendency]
// The player's single most-played RPS type overall — fallback signal during
// a shuffle-disrupted round (ai-behavior.md "Shuffle Disruption"). Returns
// null if the AI hasn't seen any RPS cards yet.
function getGlobalTendency(playerCardsSeen: CardsSeen): RPSType | null {
  let best: RPSType | null = null;
  let bestCount = 0;
  for (const type of RPS_TYPES) {
    if (playerCardsSeen[type] > bestCount) {
      best = type;
      bestCount = playerCardsSeen[type];
    }
  }
  return bestCount > 0 ? best : null;
}

// [BLOCK: Hand Helpers]
function takeCardOfType(hand: Card[], type: RPSType): Card | null {
  return hand.find((c) => c.type === type) ?? null;
}

// "Best available" fallback when the AI has no card of its desired counter
// type. This can surface the Dragon if it's still in hand — Smart AI has no
// deliberate Dragon strategy yet (not specified in ai-behavior.md), so for
// now it may play it as an incidental filler card rather than a planned swing.
// Flagging rather than inventing a heuristic for when the AI "should" hold it.
function takeBestAvailableCard(hand: Card[]): Card | null {
  if (hand.length === 0) return null;
  return shuffle([...hand])[0];
}

// [BLOCK: Smart AI Placement]
// Implements the pseudocode in ai-behavior.md "AI Hand & Placement Logic":
//   for each slot: predict -> counter -> play counter if available,
//   else best available card. Confidence gates whether the AI commits to a
//   slot's specific prediction at all; below that roll it falls back to the
//   global-tendency counter instead of the per-slot one.
//
// slotsToFill: see randomAIPlacement's doc comment — defaults to all 3.
// Prediction/confidence still reads from the REAL slot key (patternHistory
// is keyed by the board's actual left/center/right, not by position within
// slotsToFill), so a partial fill still predicts correctly per real slot.
export function smartAIPlacement(
  hand: Card[],
  aiState: AIState,
  round: number,
  slotsToFill: SlotKey[] = SLOT_KEYS
): Partial<Record<SlotKey, Card>> {
  const { patternHistory, playerCardsSeen, confidenceDisrupted } = aiState;

  const confidence = getSlotConfidence(round, confidenceDisrupted);
  const globalTendency = getGlobalTendency(playerCardsSeen);
  const globalCounter = globalTendency ? getCounter(globalTendency) : null;

  let remainingHand = [...hand];
  const placement: Partial<Record<SlotKey, Card>> = {};

  // Resolve slots in random order so a fixed left-to-right pass doesn't
  // systematically favor one slot's prediction when the hand runs short
  // of a desired type.
  const slotOrder = shuffle([...slotsToFill]);

  for (const slotKey of slotOrder) {
    const predicted = predictSlotType(patternHistory, slotKey);
    const committedToSlot = predicted !== null && Math.random() < confidence;
    const desiredType = committedToSlot ? getCounter(predicted) : globalCounter;

    let card = desiredType ? takeCardOfType(remainingHand, desiredType) : null;
    if (!card) card = takeBestAvailableCard(remainingHand);

    if (card) {
      placement[slotKey] = card;
      remainingHand = remainingHand.filter((c) => c.id !== card!.id);
    }
  }

  return placement;
}