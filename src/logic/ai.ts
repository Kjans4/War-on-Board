// src/logic/ai.ts

import type { Card, SlotKey, AIState, CardType, PatternHistory, CardsSeen } from '../types/game';
import { SLOT_KEYS, CARDS_TO_PLACE, CARDS_PER_TYPE } from '../types/game';
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

// [BLOCK: RPS Counter Lookup]
// What type beats a given type — i.e. what the AI should play to counter it.
// Inverse of combat.ts's BEATS map (Sword beats Arrow, so Shield counters Sword).
const COUNTERS: Record<CardType, CardType> = {
  Sword: 'Shield',
  Arrow: 'Sword',
  Shield: 'Arrow',
};

export function getCounter(type: CardType): CardType {
  return COUNTERS[type];
}

// [BLOCK: Slot Pattern Prediction]
// Per ai-behavior.md "Slot Pattern History" — after 2+ rounds, predicts the
// player's most frequent type in a given slot. Returns null if there isn't
// enough history yet (rounds 1-2, or right after a shuffle reset).
const MIN_ROUNDS_FOR_PREDICTION = 2;

export function predictSlotType(
  patternHistory: PatternHistory,
  slotKey: SlotKey
): CardType | null {
  const history = patternHistory[slotKey];
  if (history.length < MIN_ROUNDS_FOR_PREDICTION) return null;

  const counts: Record<CardType, number> = { Sword: 0, Arrow: 0, Shield: 0 };
  for (const type of history) counts[type]++;

  let best: CardType | null = null;
  let bestCount = 0;
  for (const type of Object.keys(counts) as CardType[]) {
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
//   - Rounds 1-2: 0 (near-random — not enough data, per ai-behavior.md)
//   - Rounds 3-5: scales linearly 0.4 -> 0.7 (pattern confidence building)
//   - Rounds 6-7: 0.85 (peak accuracy, intentionally not perfect)
// A disrupted round (post-shuffle) always forces confidence to 0, regardless
// of round number — see "Shuffle Disruption" in ai-behavior.md.
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
// Per ai-behavior.md "Card Economy Tracking" — the AI infers how many of
// each type the player likely has left, based on the known 7/7/7 deck and
// how many of each type have been seen played (tracked in playerCardsSeen,
// updated in useGameState.ts's REVEAL_ROUND case). This is per-type deck
// knowledge, distinct from per-slot pattern prediction (3.1) — 3.3 combines
// both signals when choosing a counter.

// Remaining count per type, clamped at 0 (seen counts should never exceed
// CARDS_PER_TYPE in practice, but a player's stack + hand + slots can't be
// fully reconstructed from "seen" alone — this clamp guards against drift).
export function getRemainingCounts(playerCardsSeen: CardsSeen): CardsSeen {
  const remaining = {} as CardsSeen;
  for (const type of Object.keys(playerCardsSeen) as CardType[]) {
    remaining[type] = Math.max(0, CARDS_PER_TYPE - playerCardsSeen[type]);
  }
  return remaining;
}

// Returns the type(s) the player is running low on (remaining count at or
// below the given threshold). Used to deprioritize countering a type the
// player is unlikely to still have in hand.
export function getScarceTypes(
  playerCardsSeen: CardsSeen,
  threshold: number = 1
): CardType[] {
  const remaining = getRemainingCounts(playerCardsSeen);
  return (Object.keys(remaining) as CardType[]).filter(
    (type) => remaining[type] <= threshold
  );
}

// [BLOCK: AI Placement Entry Point]
// Routes to the correct placement strategy based on difficulty.
export function getAIPlacement(
  hand: Card[],
  aiState: AIState,
  round: number
): Record<SlotKey, Card> {
  switch (aiState.difficulty) {
    case 'smart':
      return smartAIPlacement(hand, aiState, round);
    case 'random':
    default:
      return randomAIPlacement(hand);
  }
}

// [BLOCK: Global Tendency]
// The player's single most-played type overall, regardless of slot — used
// as the fallback signal during a shuffle-disrupted round, per ai-behavior.md
// "Shuffle Disruption": AI ignores per-slot pattern but "slightly prefers
// countering the player's most-played type overall." Returns null if the AI
// hasn't seen any cards yet (round 1).
function getGlobalTendency(playerCardsSeen: CardsSeen): CardType | null {
  let best: CardType | null = null;
  let bestCount = 0;
  for (const type of Object.keys(playerCardsSeen) as CardType[]) {
    if (playerCardsSeen[type] > bestCount) {
      best = type;
      bestCount = playerCardsSeen[type];
    }
  }
  return bestCount > 0 ? best : null;
}

// [BLOCK: Hand Helpers]
function takeCardOfType(hand: Card[], type: CardType): Card | null {
  return hand.find((c) => c.type === type) ?? null;
}

// "Best available" fallback when the AI has no card of its desired counter
// type. Phase 3 keeps this as a random pick from what's left — picking
// cards that specifically avoid losing matchups would require simulating
// against the player's predicted plays for every remaining slot, which
// ai-behavior.md doesn't specify a formula for; flagging rather than
// inventing one.
function takeBestAvailableCard(hand: Card[]): Card | null {
  if (hand.length === 0) return null;
  return shuffle([...hand])[0];
}

// [BLOCK: Smart AI Placement]
// Implements the pseudocode in ai-behavior.md "AI Hand & Placement Logic":
//   for each slot: predict -> counter -> play counter if available,
//   else best available card. Confidence (3.1) gates whether the AI commits
//   to a slot's specific prediction at all; below that roll (or whenever
//   confidence is 0 — early rounds or a shuffle-disrupted round per 3.4) it
//   falls back to the global-tendency counter instead of the per-slot one.
export function smartAIPlacement(
  hand: Card[],
  aiState: AIState,
  round: number
): Record<SlotKey, Card> {
  const { patternHistory, playerCardsSeen, confidenceDisrupted } = aiState;

  const confidence = getSlotConfidence(round, confidenceDisrupted);
  const globalTendency = getGlobalTendency(playerCardsSeen);
  const globalCounter = globalTendency ? getCounter(globalTendency) : null;

  let remainingHand = [...hand];
  const placement: Partial<Record<SlotKey, Card>> = {};

  // Resolve slots in random order so a fixed left-to-right pass doesn't
  // systematically favor one slot's prediction when the hand runs short
  // of a desired type.
  const slotOrder = shuffle([...SLOT_KEYS]);

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

  return placement as Record<SlotKey, Card>;
}