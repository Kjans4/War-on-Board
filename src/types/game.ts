// [BLOCK: Card Types]
export type CardType = 'Sword' | 'Arrow' | 'Shield';
// TODO: Dragon card excluded from prototype — extend CardType here when added

export type Owner = 'player' | 'ai';

export interface Card {
  id: string;        // e.g. 'player-sword-1', 'ai-arrow-3'
  type: CardType;
  exhausted: boolean; // persists through stack cycles — only resets on discard
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

export type PatternHistory = Record<SlotKey, CardType[]>;

export type CardsSeen = Record<CardType, number>;

export interface AIState {
  difficulty: AIDifficulty;
  // Smart AI tracking — unused when difficulty is 'random'
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
  | 'draw'       // round start — drawing cards from stack
  | 'placement'  // player selecting 3 cards to place in slots
  | 'reveal'     // slot-by-slot reveal sequence: left → center → right
  | 'resolution' // all slots resolved, cycling survivors
  | 'gameover';  // 7 rounds complete

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
export const DECK_SIZE = 21;
export const CARDS_PER_TYPE = 7;
export const SLOT_KEYS: SlotKey[] = ['left', 'center', 'right'];