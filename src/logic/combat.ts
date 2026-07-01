// src/logic/combat.ts

import type {
  Card,
  CardType,
  CombatOutcome,
  SlotResolution,
  RoundResolution,
  BoardSlots,
} from '../types/game';
import { SLOT_KEYS } from '../types/game';

// [BLOCK: RPS Winner]
// Returns 'player' if a beats b, 'ai' otherwise.
// Sword > Arrow > Shield > Sword
const BEATS: Record<CardType, CardType> = {
  Sword: 'Arrow',
  Arrow: 'Shield',
  Shield: 'Sword',
};

export function getRPSWinner(a: CardType, b: CardType): 'player' | 'ai' {
  return BEATS[a] === b ? 'player' : 'ai';
}

// [BLOCK: Single Slot Resolution]
// Resolves one slot matchup between a player card and an AI card.
// Handles all exhausted tie cases per card-systems.md.
// Note: mutates exhausted flag on cards when a fresh tie occurs.
export function resolveSlot(playerCard: Card, aiCard: Card): SlotResolution {
  // Same type — exhausted rules apply
  if (playerCard.type === aiCard.type) {
    // Both exhausted — both discarded
    if (playerCard.exhausted && aiCard.exhausted) {
      return {
        player: 'tied-lost',
        ai: 'tied-lost',
        playerCard,
        aiCard,
      };
    }

    // Player exhausted, AI fresh — player loses
    if (playerCard.exhausted) {
      return {
        player: 'lost',
        ai: 'won',
        playerCard,
        aiCard,
      };
    }

    // AI exhausted, player fresh — AI loses
    if (aiCard.exhausted) {
      return {
        player: 'won',
        ai: 'lost',
        playerCard,
        aiCard,
      };
    }

    // Both fresh, same type — both become exhausted, both survive
    playerCard.exhausted = true;
    aiCard.exhausted = true;
    return {
      player: 'tied',
      ai: 'tied',
      playerCard,
      aiCard,
    };
  }

  // Different types — standard RPS
  const winner = getRPSWinner(playerCard.type, aiCard.type);
  return {
    player: winner === 'player' ? 'won' : 'lost',
    ai: winner === 'ai' ? 'won' : 'lost',
    playerCard,
    aiCard,
  };
}

// [BLOCK: Full Round Resolution]
// Resolves all 3 slots in order: left → center → right.
// Requires both player and AI slots to be fully placed (no nulls).
// Throws if any slot is missing a card — caller must validate before resolving.
export function resolveRound(
  playerSlots: BoardSlots,
  aiSlots: BoardSlots
): RoundResolution {
  const resolution = {} as RoundResolution;

  for (const key of SLOT_KEYS) {
    const playerCard = playerSlots[key].card;
    const aiCard = aiSlots[key].card;

    if (!playerCard || !aiCard) {
      throw new Error(`resolveRound: missing card in slot "${key}"`);
    }

    resolution[key] = resolveSlot(playerCard, aiCard);
  }

  return resolution;
}

// [BLOCK: Survivor Cycling]
// Given a round resolution, returns which cards go back to the stack bottom.
// won → returns to stack
// tied → returns to stack (exhausted flag already set in resolveSlot)
// lost / tied-lost → discarded (not returned)
export function getSurvivors(resolution: RoundResolution): {
  playerSurvivors: Card[];
  aiSurvivors: Card[];
} {
  const playerSurvivors: Card[] = [];
  const aiSurvivors: Card[] = [];

  for (const key of SLOT_KEYS) {
    const { player, ai, playerCard, aiCard } = resolution[key];

    if (player === 'won' || player === 'tied' || player === 'tied-lost') playerSurvivors.push(playerCard);
    if (ai === 'won' || ai === 'tied' || ai === 'tied-lost') aiSurvivors.push(aiCard);
  }

  return { playerSurvivors, aiSurvivors };
}