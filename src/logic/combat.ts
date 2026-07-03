// src/logic/combat.ts

import type {
  Card,
  RPSType,
  SlotResolution,
  RoundResolution,
  BoardSlots,
  SlotKey,
} from '../types/game';
import { SLOT_KEYS } from '../types/game';

// [BLOCK: RPS Winner]
// Sword > Arrow > Shield > Sword.
// Dragon sits outside this triangle entirely and is never passed in here —
// resolveRound routes Dragon slots through the whole-round override below
// instead of calling resolveSlot/getRPSWinner on them.
const BEATS: Record<RPSType, RPSType> = {
  Sword: 'Arrow',
  Arrow: 'Shield',
  Shield: 'Sword',
};

export function getRPSWinner(a: RPSType, b: RPSType): 'player' | 'ai' {
  return BEATS[a] === b ? 'player' : 'ai';
}

// [BLOCK: Dragon Helpers]
function isDragon(card: Card): boolean {
  return card.type === 'Dragon';
}

function findDragonSlot(slots: BoardSlots): SlotKey | null {
  for (const key of SLOT_KEYS) {
    const card = slots[key].card;
    if (card && isDragon(card)) return key;
  }
  return null;
}

// [BLOCK: Single Slot Resolution — RPS/Exhausted only]
// Assumes neither card is a Dragon; resolveRound only ever calls this for
// slots untouched by a Dragon play (see below). Handles all exhausted tie
// cases per card-systems.md. Mutates the exhausted flag on cards when a
// fresh same-type tie occurs.
export function resolveSlot(playerCard: Card, aiCard: Card): SlotResolution {
  if (playerCard.type === aiCard.type) {
    if (playerCard.exhausted && aiCard.exhausted) {
      return { player: 'tied-lost', ai: 'tied-lost', playerCard, aiCard };
    }
    if (playerCard.exhausted) {
      return { player: 'lost', ai: 'won', playerCard, aiCard };
    }
    if (aiCard.exhausted) {
      return { player: 'won', ai: 'lost', playerCard, aiCard };
    }
    playerCard.exhausted = true;
    aiCard.exhausted = true;
    return { player: 'tied', ai: 'tied', playerCard, aiCard };
  }

  const winner = getRPSWinner(playerCard.type as RPSType, aiCard.type as RPSType);
  return {
    player: winner === 'player' ? 'won' : 'lost',
    ai: winner === 'ai' ? 'won' : 'lost',
    playerCard,
    aiCard,
  };
}

// [BLOCK: Full Round Resolution]
// Resolves all 3 slots: left → center → right.
// Requires both player and AI slots to be fully placed — caller must
// validate before resolving (throws otherwise, matching prior behavior).
//
// Dragon addendum (war-on-board-gdd.md's Dragon section, extended):
//   - Dragon's own slot: Dragon is discarded ('lost'). 'lost' cards are
//     never returned to stack (see getSurvivors below), so this alone
//     satisfies "Dragon cannot be used again" with no extra state needed.
//   - One-sided Dragon play: all 3 of the opponent's cards are destroyed
//     ('lost'), the Dragon player's other 2 slots survive ('won')
//     regardless of what's actually in them.
//   - Both sides play Dragon (any slot): effects cancel. Both Dragons are
//     discarded with no destruction. Where one side's Dragon faces a
//     non-Dragon card, that card survives untouched. Any slot untouched by
//     either Dragon resolves normally via resolveSlot.
export function resolveRound(
  playerSlots: BoardSlots,
  aiSlots: BoardSlots
): RoundResolution {
  for (const key of SLOT_KEYS) {
    if (!playerSlots[key].card || !aiSlots[key].card) {
      throw new Error(`resolveRound: missing card in slot "${key}"`);
    }
  }

  const resolution = {} as RoundResolution;

  const playerDragonSlot = findDragonSlot(playerSlots);
  const aiDragonSlot = findDragonSlot(aiSlots);
  const playerHasDragon = playerDragonSlot !== null;
  const aiHasDragon = aiDragonSlot !== null;

  // [SUB-BLOCK: Both play Dragon — cancel]
  if (playerHasDragon && aiHasDragon) {
    for (const key of SLOT_KEYS) {
      const playerCard = playerSlots[key].card!;
      const aiCard = aiSlots[key].card!;
      const playerIsDragon = key === playerDragonSlot;
      const aiIsDragon = key === aiDragonSlot;

      if (playerIsDragon && aiIsDragon) {
        // Dragon vs Dragon, same slot — both discarded, no contest.
        resolution[key] = { player: 'lost', ai: 'lost', playerCard, aiCard };
      } else if (playerIsDragon) {
        // Player's Dragon discarded; AI's card here is untouched (cancelled).
        resolution[key] = { player: 'lost', ai: 'won', playerCard, aiCard };
      } else if (aiIsDragon) {
        resolution[key] = { player: 'won', ai: 'lost', playerCard, aiCard };
      } else {
        resolution[key] = resolveSlot(playerCard, aiCard);
      }
    }
    return resolution;
  }

  // [SUB-BLOCK: Player plays Dragon]
  if (playerHasDragon) {
    for (const key of SLOT_KEYS) {
      const playerCard = playerSlots[key].card!;
      const aiCard = aiSlots[key].card!;
      resolution[key] =
        key === playerDragonSlot
          ? { player: 'lost', ai: 'lost', playerCard, aiCard }
          : { player: 'won', ai: 'lost', playerCard, aiCard };
    }
    return resolution;
  }

  // [SUB-BLOCK: AI plays Dragon]
  if (aiHasDragon) {
    for (const key of SLOT_KEYS) {
      const playerCard = playerSlots[key].card!;
      const aiCard = aiSlots[key].card!;
      resolution[key] =
        key === aiDragonSlot
          ? { player: 'lost', ai: 'lost', playerCard, aiCard }
          : { player: 'lost', ai: 'won', playerCard, aiCard };
    }
    return resolution;
  }

  // [SUB-BLOCK: No Dragon — normal per-slot resolution]
  for (const key of SLOT_KEYS) {
    resolution[key] = resolveSlot(playerSlots[key].card!, aiSlots[key].card!);
  }

  return resolution;
}

// [BLOCK: Survivor Cycling]
// Given a round resolution, returns which cards go back to the stack bottom.
// won → returns to stack
// tied → returns to stack (exhausted flag already set in resolveSlot)
// lost / tied-lost → discarded (not returned) — this is also how a played
// Dragon permanently leaves the game; no separate "used" flag required.
export function getSurvivors(resolution: RoundResolution): {
  playerSurvivors: Card[];
  aiSurvivors: Card[];
} {
  const playerSurvivors: Card[] = [];
  const aiSurvivors: Card[] = [];

  for (const key of SLOT_KEYS) {
    const { player, ai, playerCard, aiCard } = resolution[key];

    if (player === 'won' || player === 'tied') playerSurvivors.push(playerCard);
    if (ai === 'won' || ai === 'tied') aiSurvivors.push(aiCard);
  }

  return { playerSurvivors, aiSurvivors };
}