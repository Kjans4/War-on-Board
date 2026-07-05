// src/logic/deck.ts

import type { Card, CardType, RPSType, Owner } from '../types/game';
import { CARDS_PER_TYPE } from '../types/game';

// [BLOCK: Deck Creation]
const RPS_CARD_TYPES: RPSType[] = ['Sword', 'Arrow', 'Shield'];

// 22 cards per deck: 7 Sword, 7 Arrow, 7 Shield, 1 Dragon.
export function createDeck(owner: Owner): Card[] {
  const cards: Card[] = [];

  for (const type of RPS_CARD_TYPES) {
    for (let i = 1; i <= CARDS_PER_TYPE; i++) {
      cards.push({
        id: `${owner}-${type.toLowerCase()}-${i}`,
        type,
        exhausted: false,
        owner,
      });
    }
  }

  // [SUB-BLOCK: Dragon]
  // 1 per deck. Never exhausted — resolved via the whole-round override in
  // combat.ts, not the per-slot RPS/exhausted path, so it never reaches the
  // code that would flip this flag.
  cards.push({
    id: `${owner}-dragon-1`,
    type: 'Dragon',
    exhausted: false,
    owner,
  });

  return cards;
}

// [BLOCK: Fisher-Yates Shuffle]
// Mutates the array in place — call on a copy if you need the original
export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function createShuffledDeck(owner: Owner): Card[] {
  return shuffle(createDeck(owner));
}

// [BLOCK: Draw Logic]
// Draws cards from the top of the stack until hand reaches handSize.
// If stack has fewer cards than needed, draws all remaining — hand may be
// smaller than handSize. Returns updated hand and stack; does not mutate originals.
export function drawToFill(
  hand: Card[],
  stack: Card[],
  handSize: number
): { hand: Card[]; stack: Card[] } {
  const needed = handSize - hand.length;

  if (needed <= 0) return { hand, stack };

  const drawn = stack.slice(0, needed);
  const remaining = stack.slice(needed);

  return {
    hand: [...hand, ...drawn],
    stack: remaining,
  };
}

// [BLOCK: Stack Shuffle]
// Player-triggered shuffle — randomizes current stack order.
// Survivors at the bottom may move anywhere.
export function shuffleStack(stack: Card[]): Card[] {
  return shuffle([...stack]);
}

// [BLOCK: Dev Test Mode — Stack Type Counts]
// Phase 2 used this implicitly via the raw array in the stack inspector;
// Phase 3 needs actual per-type counts to drive the hand-card type picker's
// "(N left)" labels and disabled state. Counts only what's currently sitting
// in that side's stack — cards already in hand or placed in slots aren't
// visible to this function, matching "requested type unavailable" meaning
// exactly what it says (not just globally scarce).
export function getStackTypeCounts(stack: Card[]): Record<CardType, number> {
  const counts: Record<CardType, number> = { Sword: 0, Arrow: 0, Shield: 0, Dragon: 0 };
  for (const card of stack) {
    counts[card.type]++;
  }
  return counts;
}