// src/logic/combat.ts

import type {
  Card,
  RPSType,
  SlotResolution,
  RoundResolution,
  BoardSlots,
  SlotKey,
  Owner,
  CombatOutcome,
  CascadeResult,
  CascadeCardRef,
  CascadeFightLog,
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

// Scans the PLACED cards (before resolution even runs) for exactly one
// Dragon across both sides. Used by the reveal-animation timeline in
// App.tsx, which needs to know the Dragon's position before REVEAL_ROUND's
// dispatch has actually updated state. Returns null if there's no Dragon
// this round, or if both sides played one (that's a cancel — see
// resolveRound's both-Dragon branch — so there's no single wipe to
// animate/announce).
export function findDragonPlacement(
  playerSlots: BoardSlots,
  aiSlots: BoardSlots
): { owner: Owner; slotKey: SlotKey } | null {
  const found: { owner: Owner; slotKey: SlotKey }[] = [];
  for (const key of SLOT_KEYS) {
    if (playerSlots[key].card?.type === 'Dragon') found.push({ owner: 'player', slotKey: key });
    if (aiSlots[key].card?.type === 'Dragon') found.push({ owner: 'ai', slotKey: key });
  }
  return found.length === 1 ? found[0] : null;
}

// Same idea, but reads the outcome directly from an already-computed
// RoundResolution (used by RECORD_HISTORY, after REVEAL_ROUND has run).
// Only ever finds a match on a single-Dragon round — a both-Dragon round
// never produces a 'dragon' outcome (that lane resolves to 'lost'/'lost'
// as a cancel), so this correctly returns null for that case too.
export function getDragonInfo(resolution: RoundResolution): { side: Owner; slotKey: SlotKey } | null {
  const dragonLanes: { side: Owner; slotKey: SlotKey }[] = [];
  for (const key of SLOT_KEYS) {
    if (resolution[key].player === 'dragon') dragonLanes.push({ side: 'player', slotKey: key });
    if (resolution[key].ai === 'dragon') dragonLanes.push({ side: 'ai', slotKey: key });
  }
  return dragonLanes.length === 1 ? dragonLanes[0] : null;
}

// [BLOCK: Single Slot Resolution — RPS/Exhausted only]
// Assumes neither card is a Dragon; resolveRound only ever calls this for
// slots untouched by a Dragon play (see below). Handles all exhausted tie
// cases per card-systems.md. Mutates the exhausted flag on cards when a
// fresh same-type tie occurs.
//
// Also reused directly by resolveCascade() below for cascade fights —
// cascade combat runs through the exact same RPS + exhausted rules as
// normal lane resolution, per design discussion.
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
// Dragon addendum (war-on-board-gdd.md's Dragon section, extended per
// design discussion):
//   - Dragon's own slot: for its OWNER, this resolves to 'dragon' — a
//     distinct outcome from 'lost'. Mechanically identical to 'lost' for
//     survivor cycling (never returns to stack, single-use), but reads
//     correctly in the UI as a deliberate wipe rather than a defeat. The
//     opposing card in that same lane is destroyed ('lost'), same as before.
//   - One-sided Dragon play: all of the opponent's OTHER cards are
//     destroyed ('lost'), the Dragon player's other 2 slots survive
//     ('won') regardless of what's actually in them — those 2 cards
//     return to stack normally, "saving" them.
//   - Both sides play Dragon (any slot): effects cancel. Both Dragons are
//     discarded ('lost'/'lost' — a mutual cancel, NOT the 'dragon'
//     outcome, since neither side actually wiped anything). Where one
//     side's Dragon faces a non-Dragon card, that card survives untouched.
//     Any slot untouched by either Dragon resolves normally via
//     resolveSlot — normal combat continues in those lanes.
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
        // Dragon vs Dragon, same slot — both discarded, no contest, no wipe.
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
          ? { player: 'dragon', ai: 'lost', playerCard, aiCard }
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
          ? { player: 'lost', ai: 'dragon', playerCard, aiCard }
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
// lost / tied-lost / dragon → discarded (not returned) — 'dragon' is
// mechanically identical to 'lost' here: a played Dragon permanently
// leaves the game either way, whether it's framed as a win or a loss.
//
// NOTE: this reflects the raw per-lane resolution only. Cascade overrides
// (see resolveCascade below) are applied on top of this by the caller
// (useGameState.ts's NEXT_ROUND) — a card counted as a survivor here may
// still be discarded if the cascade flipped its lane's outcome to 'lost'.
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

// [BLOCK: Cascade Combat]
// After normal per-lane resolution, whichever card WON its lane (from
// either side) enters a sequential elimination fight, Left -> Center ->
// Right. Tied/tied-lost lanes withdraw and never enter the cascade.
//
// Algorithm: walk the ordered list of lane-winners. The first winner
// becomes the "champion" with no fight. Each subsequent winner either:
//   - belongs to the SAME owner as the current champion -> no fight, it's
//     queued as a reserve (their side already "holds" this position);
//   - belongs to the OTHER owner -> fights the champion via resolveSlot
//     (same RPS + exhausted rules as lane resolution).
// On a champion loss, the new champion (the winner of that fight)
// immediately has to fight through any queued reserves of the fallen
// champion's owner, in the order they were queued — this is what produces
// "if the opponent wins, it fights the last winning card of the player"
// when there's more than one card on the losing side still in reserve.
// A tie inside the cascade halts the entire chain immediately — no further
// fights occur, and any not-yet-fought reserves simply stand as survivors.
//
// A Dragon round never enters the cascade at all — the whole round was
// already resolved by the Dragon override above, so there's no per-lane
// "winner" in the normal sense to run a cascade over.

interface CascadeEntry {
  slotKey: SlotKey;
  owner: Owner;
  card: Card;
}

// Collects lane-winners in Left -> Center -> Right order. Ties/tied-lost
// lanes are excluded entirely (they withdraw from the cascade).
function collectWonEntries(resolution: RoundResolution): CascadeEntry[] {
  const entries: CascadeEntry[] = [];
  for (const key of SLOT_KEYS) {
    const { player, ai, playerCard, aiCard } = resolution[key];
    if (player === 'won') entries.push({ slotKey: key, owner: 'player', card: playerCard });
    else if (ai === 'won') entries.push({ slotKey: key, owner: 'ai', card: aiCard });
  }
  return entries;
}

// Runs a single cascade fight between two entries via the same
// resolveSlot() used for lane resolution — mutates exhausted flags exactly
// like a normal matchup would.
function runCascadeFight(
  a: CascadeEntry,
  b: CascadeEntry
): { aOutcome: CombatOutcome; bOutcome: CombatOutcome } {
  const playerEntry = a.owner === 'player' ? a : b;
  const aiEntry = a.owner === 'player' ? b : a;
  const result = resolveSlot(playerEntry.card, aiEntry.card);
  const aOutcome = a.owner === 'player' ? result.player : result.ai;
  const bOutcome = b.owner === 'player' ? result.player : result.ai;
  return { aOutcome, bOutcome };
}

function refOf(entry: CascadeEntry): CascadeCardRef {
  return { slotKey: entry.slotKey, owner: entry.owner };
}

// Detects whether a Dragon was played this round at all — if so, the whole
// round was already resolved via the Dragon override in resolveRound(), so
// there's no meaningful per-lane "winner" to run a cascade over.
export function roundHasDragon(resolution: RoundResolution): boolean {
  return SLOT_KEYS.some(
    (key) =>
      resolution[key].playerCard.type === 'Dragon' ||
      resolution[key].aiCard.type === 'Dragon'
  );
}

export function resolveCascade(resolution: RoundResolution, dragonPlayed: boolean): CascadeResult {
  const entries = dragonPlayed ? [] : collectWonEntries(resolution);

  // 0 or 1 lane-winners: nothing to fight. The single winner (if any)
  // stands by default with no cascade fight required.
  if (entries.length <= 1) {
    return {
      triggered: false,
      overrides: [],
      survivingSlots: entries.map(refOf),
      log: [],
    };
  }

  const overrides: CascadeCardRef[] = [];
  const log: CascadeFightLog[] = [];

  const queue = [...entries];
  let champion = queue.shift()!;
  const reserves: CascadeEntry[] = [];
  let halted = false;

  function fight(champ: CascadeEntry, challenger: CascadeEntry) {
    const { aOutcome, bOutcome } = runCascadeFight(champ, challenger);
    const outcome =
      aOutcome === 'tied' ? 'tied' :
      aOutcome === 'tied-lost' ? 'tiedLost' :
      aOutcome === 'won' ? 'championWon' : 'challengerWon';

    log.push({
      championSlot: champ.slotKey,
      championOwner: champ.owner,
      challengerSlot: challenger.slotKey,
      challengerOwner: challenger.owner,
      outcome,
    });

    return { champOutcome: aOutcome, challOutcome: bOutcome };
  }

  while (queue.length > 0 && !halted) {
    const next = queue.shift()!;

    if (next.owner === champion.owner) {
      // Same side — no fight, just reinforces this owner's hold. Queued in
      // case the champion later falls to the other side.
      reserves.push(next);
      continue;
    }

    const { champOutcome, challOutcome } = fight(champion, next);

    if (champOutcome === 'tied' || champOutcome === 'tied-lost') {
      halted = true;
      if (champOutcome === 'tied-lost') overrides.push(refOf(champion));
      if (challOutcome === 'tied-lost') overrides.push(refOf(next));
      break;
    }

    if (champOutcome === 'won') {
      overrides.push(refOf(next));
      // champion persists, reserves stay queued, untouched
    } else {
      // champion falls — the challenger becomes the new champion and must
      // immediately fight through any reserves the fallen champion's side
      // had queued up, in the order they were queued.
      overrides.push(refOf(champion));
      champion = next;

      while (reserves.length > 0 && !halted) {
        const reserve = reserves.shift()!;
        const r = fight(champion, reserve);

        if (r.champOutcome === 'tied' || r.champOutcome === 'tied-lost') {
          halted = true;
          if (r.champOutcome === 'tied-lost') overrides.push(refOf(champion));
          if (r.challOutcome === 'tied-lost') overrides.push(refOf(reserve));
          break;
        }

        if (r.champOutcome === 'won') {
          overrides.push(refOf(reserve));
        } else {
          overrides.push(refOf(champion));
          champion = reserve;
        }
      }
    }
  }

  const overriddenKeys = new Set(overrides.map((o) => `${o.slotKey}-${o.owner}`));
  const survivingSlots = entries
    .filter((e) => !overriddenKeys.has(`${e.slotKey}-${e.owner}`))
    .map(refOf);

  return { triggered: true, overrides, survivingSlots, log };
}

// Derives a round-winner label purely from the cascade's final standing
// cards — used for round history display. 'draw' means a cascade tie
// halted the chain with cards from both sides still standing; null means
// nothing won a lane at all (e.g. a round of pure ties, or a Dragon round).
export function getCascadeRoundWinner(cascade: CascadeResult): Owner | 'draw' | null {
  const owners = new Set(cascade.survivingSlots.map((s) => s.owner));
  if (owners.size === 0) return null;
  if (owners.size === 1) return [...owners][0];
  return 'draw';
}