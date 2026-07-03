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
  | 'empty'      // no card placed yet
  | 'placed'     // card placed face-down, awaiting reveal
  | 'revealed'   // card flipped face-up during resolution
  | 'won'        // card survived this round
  | 'lost'       // card discarded after resolution
  | 'tied'       // same-type fresh tie — card exhausted, survived
  | 'tied-lost'; // exhausted vs exhausted — both discarded

export interface Slot {
  key: SlotKey;
  card: Card | null;
  state: SlotState;
}

export type BoardSlots = Record<SlotKey, Slot>;

// [BLOCK: Combat]
export type CombatOutcome = 'won' | 'lost' | 'tied' | 'tied-lost';

export interface SlotResolution {
  player: CombatOutcome;
  ai: CombatOutcome;
  playerCard: Card;
  aiCard: Card;
}

export interface RoundResolution {
  left: SlotResolution;
  center: SlotResolution;
  right: SlotResolution;
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
  playerSlots: Record<SlotKey, CardType>;
  aiSlots: Record<SlotKey, CardType>;
  resolutions: Record<SlotKey, { player: CombatOutcome; ai: CombatOutcome }>;
  playerCardsAfter: number; // stack + hand count after round
  aiCardsAfter: number;
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
  round: number;          // 1–7
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

  // Result — only set when phase is 'gameover'
  result: 'player' | 'ai' | 'draw' | null;
}

// [BLOCK: Constants]
export const HAND_SIZE = 5;
export const CARDS_TO_PLACE = 3;
export const TOTAL_ROUNDS = 7;
export const CARDS_PER_TYPE = 7;               // per RPS type
export const DRAGON_COUNT = 1;                 // per deck
export const DECK_SIZE = CARDS_PER_TYPE * 3 + DRAGON_COUNT; // 22
export const SLOT_KEYS: SlotKey[] = ['left', 'center', 'right'];
export const RPS_TYPES: RPSType[] = ['Sword', 'Arrow', 'Shield'];