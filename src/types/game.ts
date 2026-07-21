// src/types/game.ts

// [BLOCK: Card Types]
// RPSType is the rock-paper-scissors triangle Smart AI's pattern/economy
// tracking and combat.ts's per-slot resolution operate on. CardType extends
// this with Dragon, which sits outside the triangle entirely and is
// resolved via a whole-round override in combat.ts instead of resolveSlot.
export type RPSType = 'Sword' | 'Arrow' | 'Shield';
export type CardType = RPSType | 'Dragon';

export type Owner = 'player' | 'ai';

export interface Card {
  id: string;         // e.g. 'player-sword-1', 'ai-dragon-1'
  type: CardType;
  exhausted: boolean;  // persists through stack cycles — Dragon is never
                        // exhausted; it never passes through resolveSlot's
                        // exhausted-mutation path (see combat.ts).
  owner: Owner;
}

// [BLOCK: Slot Types]
export type SlotKey = 'left' | 'center' | 'right';

export type SlotState =
  | 'empty'      // no card placed yet — ALSO reused post-resolution for a
                  // slot where this side had no card to place at all this
                  // round (see CombatOutcome's 'empty' below and card-
                  // scarcity handling in combat.ts) — same "blank, no
                  // badge" rendering already covers both cases in Slot.tsx
                  // with no extra code, since OUTCOME_CONFIG there has no
                  // entry for 'empty' either way.
  | 'placed'     // card placed face-down, awaiting reveal
  | 'revealed'   // card flipped face-up during resolution
  | 'won'        // card survived this round's lane resolution — this now
                  // also covers an UNCONTESTED win, where the opposing
                  // side had no card in this slot at all (card scarcity)
                  // and this card's win is automatic rather than an RPS
                  // comparison; it's still cascade-eligible either way,
                  // see combat.ts's resolveSlotAny.
  | 'lost'       // card discarded — lost its lane outright, was destroyed
                  // by the opponent's Dragon, or was cancelled in a
                  // both-play-Dragon lane
  | 'tied'       // same-type fresh tie — card exhausted, survived, withdraws
                  // from the cascade entirely
  | 'tied-lost'  // exhausted vs exhausted — both discarded, withdraws from
                  // the cascade entirely
  | 'dragon'     // the Dragon's own lane, for its owner only — a distinct
                  // "win" from a plain 'won': the card is consumed forever
                  // (never returns to stack, same as 'lost' for cycling
                  // purposes) but the outcome is a deliberate wipe, not a
                  // loss. Kept separate from 'lost' purely so it reads
                  // correctly in the UI instead of looking like the
                  // Dragon itself lost.
  | 'cascaded';  // won its lane's RPS matchup outright, but was then
                  // eliminated in the post-resolution cascade fight (see
                  // combat.ts's resolveCascade / CascadeResult). Mechanically
                  // identical to 'lost' for survivor cycling — either way the
                  // card is discarded, never returns to stack — but kept
                  // distinct purely so the board and round history can show
                  // "won, then fell in the cascade" instead of a plain,
                  // confusing loss. Computed once in useGameState.ts's
                  // REVEAL_ROUND (see its Cascade Relabeling sub-block) and
                  // carried in pendingResolution from there on.

export interface Slot {
  key: SlotKey;
  card: Card | null;
  state: SlotState;
}

export type BoardSlots = Record<SlotKey, Slot>;

// [BLOCK: Combat]
// [Card Scarcity] 'empty' added — a side can now legitimately have NO card
// in a given slot for the round (its stack is empty and hand ran out
// before reaching 3 — see combat.ts's card-scarcity handling and
// useGameState.ts's getPlacementCap). Distinct from every other outcome:
// there's no card to discard, return to stack, or animate a flight for.
export type CombatOutcome = 'won' | 'lost' | 'tied' | 'tied-lost' | 'dragon' | 'cascaded' | 'empty';

// [Card Scarcity] playerCard/aiCard are now nullable — a slot can resolve
// with only one side present (that side's outcome is 'won' — see
// combat.ts's resolveSlotAny) or, more rarely, neither side present
// (both 'empty', a lane that simply never happened this round). Every
// consumer that reads these fields (getSurvivors, NEXT_ROUND's discard
// routing, App.tsx's flight builders, RECORD_HISTORY) has to treat them
// as possibly null now — see each file's own doc comments at the
// relevant read site.
export interface SlotResolution {
  player: CombatOutcome;
  ai: CombatOutcome;
  playerCard: Card | null;
  aiCard: Card | null;
}

export interface RoundResolution {
  left: SlotResolution;
  center: SlotResolution;
  right: SlotResolution;
}

// [BLOCK: Cascade Combat]
// After normal per-lane resolution, whichever card WON its lane (from
// either side) enters a sequential elimination fight, in Left -> Center ->
// Right order. Tied/tied-lost lanes withdraw and never enter the cascade.
// A Dragon round never enters the cascade at all (see combat.ts's
// resolveCascade — it's gated on dragonPlayed). An uncontested win (card
// scarcity — the opposing side had no card in this lane) enters the
// cascade exactly like any other 'won' lane; collectWonEntries in
// combat.ts doesn't distinguish "won by beating something" from "won by
// default," both just read as 'won' on that side.
export type CascadeFightOutcome =
  | 'championWon'    // the standing champion beat the challenger
  | 'challengerWon'  // the challenger beat the champion (champion falls)
  | 'tied'           // fresh vs fresh in the cascade fight — chain halts
  | 'tiedLost';       // exhausted vs exhausted in the cascade fight — both
                       // discarded, chain halts

export interface CascadeFightLog {
  championSlot: SlotKey;
  championOwner: Owner;
  challengerSlot: SlotKey;
  challengerOwner: Owner;
  outcome: CascadeFightOutcome;
}

// A single (slotKey, owner) reference — used both for cards that were
// overridden to 'lost' by the cascade, and for cards left standing at the
// end of it.
export interface CascadeCardRef {
  slotKey: SlotKey;
  owner: Owner;
}

export interface CascadeResult {
  // false when the cascade never had more than one lane-winner to compare
  // (0 or 1 "won" lanes, or a Dragon round) — no fights occurred, though a
  // single winner may still stand by default.
  triggered: boolean;
  // Cards that won their own lane but were discarded by a cascade fight —
  // consumers must flip these from 'won' to 'lost' for slot state, scoring,
  // and survivor cycling.
  overrides: CascadeCardRef[];
  // Card(s) left standing once the cascade finishes (or halts on a tie).
  survivingSlots: CascadeCardRef[];
  log: CascadeFightLog[];
}

// [BLOCK: AI]
export type AIDifficulty = 'random' | 'smart';

// Pattern/economy tracking only ever concerns the RPS triangle. Dragon plays
// are intentionally excluded from both — ai-behavior.md doesn't define any
// pattern or economy behavior for it, so it's left untracked rather than
// guessed at (see useGameState.ts's REVEAL_ROUND case for where it's filtered out).
export type PatternHistory = Record<SlotKey, RPSType[]>;
export type CardsSeen = Record<RPSType, number>;

export interface AIState {
  difficulty: AIDifficulty;
  patternHistory: PatternHistory;
  playerCardsSeen: CardsSeen;
  confidenceDisrupted: boolean; // true for one round after player shuffles
}

// [BLOCK: Round History]
export interface RoundHistoryEntry {
  round: number;
  // [Card Scarcity] Nullable — a side that had no card in a given slot
  // this round (see combat.ts's resolveRound) has nothing to record here.
  // RoundHistory.tsx displays '—' for a null entry instead of a card
  // type name.
  playerSlots: Record<SlotKey, CardType | null>;
  aiSlots: Record<SlotKey, CardType | null>;
  resolutions: Record<SlotKey, { player: CombatOutcome; ai: CombatOutcome }>;
  playerCardsAfter: number; // stack + hand count after round
  aiCardsAfter: number;
  // null only when no cascade result exists at all (shouldn't normally
  // happen post-REVEAL_ROUND, but kept nullable defensively).
  cascade: {
    triggered: boolean;
    log: CascadeFightLog[];
    survivingSlots: CascadeCardRef[];
    // 'draw' when a cascade tie halts the chain with cards from both
    // sides still standing; null when nothing won a lane at all (e.g. a
    // round of pure ties, or a Dragon round).
    roundWinner: Owner | 'draw' | null;
  } | null;
  // Set only when exactly one side played a Dragon this round (a
  // both-sides-Dragon round cancels out and leaves these null — no wipe
  // happened, normal lanes just fought it out).
  dragonSide: Owner | null;
  dragonSlot: SlotKey | null;
}

// [BLOCK: Game Phase]
export type GamePhase =
  | 'draw'
  | 'placement'
  | 'reveal'
  | 'resolution'
  | 'gameover';

// [BLOCK: Game State]
export interface GameState {
  round: number;          // 1–9
  phase: GamePhase;

  // Player
  playerStack: Card[];
  playerHand: Card[];
  playerSlots: BoardSlots;

  // AI
  aiStack: Card[];
  aiHand: Card[];
  aiSlots: BoardSlots;

  // AI brain
  ai: AIState;

  // History
  roundHistory: RoundHistoryEntry[];

  // [BLOCK: Discard Piles]
  // Purely presentational bookkeeping, added for the discard-pile
  // animation/UI (see App.tsx's buildReturnFlights + Board.tsx's
  // DiscardPile). Cards that were NOT returned to the stack at NEXT_ROUND
  // (lost, tied-lost, dragon, or cascade-overridden) land here instead.
  // Doesn't feed back into any combat/AI logic — a card here is simply
  // gone from play, exactly as before this field existed.
  playerDiscard: Card[];
  aiDiscard: Card[];

  // [BLOCK: Pending Resolution / Cascade]
  // Both set once by REVEAL_ROUND (the single call to resolveRound() and
  // resolveCascade() for a given round) and read by both RECORD_HISTORY
  // (to build the history entry) and NEXT_ROUND (to compute survivors).
  // This exists because resolveSlot() mutates card.exhausted in place on a
  // fresh same-type tie — calling resolveRound() or resolveCascade() a
  // second time on the same card objects would re-evaluate an
  // already-exhausted pair incorrectly. Both are cleared back to null once
  // NEXT_ROUND consumes them.
  //
  // App.tsx's return-flight animation reads these too (via a stateRef, at
  // timer-fire time) purely to decide each card's destination — it never
  // recomputes resolveRound/resolveCascade itself, for the same
  // no-double-mutation reason.
  pendingResolution: RoundResolution | null;
  pendingCascade: CascadeResult | null;

  // [BLOCK: Dev Test Mode]
  // Phase 1: when true, the AI's hand renders face-up in the UI instead of
  // face-down, so the person can see what the AI is holding before placing.
  // Does NOT change AI placement logic — Random/Smart AI still decides
  // where its cards go; this only affects what's visible and (in later
  // phases) editable. See dev-test-mode-plan.md.
  devMode: boolean;

  // Result — only set when phase is 'gameover'
  result: 'player' | 'ai' | 'draw' | null;
}

// [BLOCK: Constants]
export const HAND_SIZE = 5;
export const CARDS_TO_PLACE = 3;
export const TOTAL_ROUNDS = 9;                 // extended from 7 per design discussion
export const CARDS_PER_TYPE = 7;               // per RPS type — deck size unchanged
export const DRAGON_COUNT = 1;                 // per deck
export const DECK_SIZE = CARDS_PER_TYPE * 3 + DRAGON_COUNT; // 22
export const SLOT_KEYS: SlotKey[] = ['left', 'center', 'right'];
export const RPS_TYPES: RPSType[] = ['Sword', 'Arrow', 'Shield'];

// [BLOCK: Card Scarcity — Placement Cap]
// A side's real placement target for THIS round: normally always 3 (the
// number of slots), but drops below that once its stack is fully empty
// and its hand can't reach 3 either — see the Card Scarcity notes above.
// `hand.length + filled` is invariant across the whole placement phase
// (a card only ever moves between hand and a slot, never anywhere else,
// until NEXT_ROUND), so this can be safely recomputed at any point during
// placement — before anything's been placed, during, or once finished —
// and always yields the same answer for a given round. Each side is
// capped INDEPENDENTLY by its own hand/stack state — per explicit design
// direction, a scarce player doesn't force the AI (or vice versa) to also
// place fewer; a 2-card side just leaves its own unfilled slot(s) as
// uncontested wins for whatever the other side has there (see
// combat.ts's resolveSlotAny).
export function getPlacementCap(hand: Card[], slots: BoardSlots): number {
  const filled = SLOT_KEYS.filter((k) => slots[k].card !== null).length;
  return Math.min(CARDS_TO_PLACE, hand.length + filled);
}