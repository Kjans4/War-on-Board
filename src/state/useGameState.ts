// src/state/useGameState.ts

import { useReducer } from 'react';
import type {
  GameState,
  Card,
  SlotKey,
  BoardSlots,
  AIDifficulty,
  RoundHistoryEntry,
  RoundResolution,
  Owner,
  RPSType,
} from '../types/game';
import {
  HAND_SIZE,
  CARDS_TO_PLACE,
  TOTAL_ROUNDS,
  SLOT_KEYS,
  getPlacementCap,
} from '../types/game';
import { createShuffledDeck, drawToFill, shuffleStack } from '../logic/deck';
import {
  resolveRound,
  getSurvivors,
  resolveCascade,
  roundHasDragon,
  getCascadeRoundWinner,
  getDragonInfo,
} from '../logic/combat';

// [BLOCK: Initial State Helpers]
function makeEmptySlots(): BoardSlots {
  return {
    left:   { key: 'left',   card: null, state: 'empty' },
    center: { key: 'center', card: null, state: 'empty' },
    right:  { key: 'right',  card: null, state: 'empty' },
  };
}

function makeInitialState(difficulty: AIDifficulty = 'random'): GameState {
  const playerStack = createShuffledDeck('player');
  const aiStack = createShuffledDeck('ai');

  return {
    round: 1,
    phase: 'draw',

    playerStack,
    playerHand: [],
    playerSlots: makeEmptySlots(),

    aiStack,
    aiHand: [],
    aiSlots: makeEmptySlots(),

    ai: {
      difficulty,
      patternHistory: { left: [], center: [], right: [] },
      playerCardsSeen: { Sword: 0, Arrow: 0, Shield: 0 },
      confidenceDisrupted: false,
    },

    roundHistory: [],
    playerDiscard: [],
    aiDiscard: [],
    pendingResolution: null,
    pendingCascade: null,
    devMode: false,
    result: null,
  };
}

// [BLOCK: Action Types]
export type GameAction =
  | { type: 'DRAW_CARDS' }
  | { type: 'PLACE_CARD'; slotKey: SlotKey; card: Card }
  | { type: 'REMOVE_CARD'; slotKey: SlotKey }
  // [Dev Test Mode] Single-card AI place/remove — mirrors PLACE_CARD/
  // REMOVE_CARD exactly, but for the AI's own slots. Distinct from the
  // bulk PLACE_AI_CARDS below (which the AI's own ~2s placement timer
  // dispatches) — these two exist so a devMode tester can edit the AI's
  // board one card at a time, the same way the player edits their own,
  // including removing/replacing a card in an already-full slot.
  | { type: 'PLACE_AI_CARD'; slotKey: SlotKey; card: Card }
  | { type: 'REMOVE_AI_CARD'; slotKey: SlotKey }
  // placements is Partial — getAIPlacement (logic/ai.ts) only returns
  // entries for the slots it was asked to fill (slotsToFill), which may be
  // a subset when Dev Test Mode's manual AI placement has already claimed
  // some slots before this fires (see App.tsx's AI Placement Timer), OR
  // when the AI's own hand simply doesn't have enough cards left to fill
  // every slot (card scarcity — see types/game.ts's getPlacementCap;
  // randomAIPlacement/smartAIPlacement in logic/ai.ts already leave a
  // slot unfilled gracefully when hand runs short, with no changes needed
  // there).
  | { type: 'PLACE_AI_CARDS'; placements: Partial<Record<SlotKey, Card>> }
  | { type: 'START_REVEAL' }
  | { type: 'REVEAL_ROUND' }
  | { type: 'RECORD_HISTORY' }
  | { type: 'NEXT_ROUND' }
  | { type: 'SHUFFLE_STACK' }
  | { type: 'SET_DIFFICULTY'; difficulty: AIDifficulty }
  | { type: 'SET_DEV_MODE'; devMode: boolean }
  // [Dev Test Mode — Phase 2] Swap a hand card (not yet placed) for a
  // different type, pulled from that same owner's own stack. Same-side,
  // same-pool only — never crosses player/AI pools, never fabricates a
  // card outside the fixed 21-card composition. newType is RPSType only;
  // Dragon is excluded from the swap picker entirely (see
  // CardTypePicker.tsx / dev-test-mode-plan.md's standing conflict note).
  | { type: 'DEV_SWAP_HAND_CARD'; owner: Owner; cardId: string; newType: RPSType }
  // [Dev Test Mode — Phase 3] Swap a card SITTING IN THE STACK (opened via
  // the Phase 1 Stack Inspector) for a different type — never fabricates
  // or removes a card, just swaps positions with another card of the
  // chosen type already in that SAME stack (see logic/deck.ts's
  // getStackTypeCounts(stack, excludeId), which was built ahead of this
  // phase specifically to support it). Gated identically to SHUFFLE_STACK
  // (any phase except 'reveal'/'gameover') rather than 'placement' only —
  // confirmed scope: both player's and AI's stacks are editable this way.
  | { type: 'DEV_SWAP_STACK_CARD'; owner: Owner; cardId: string; newType: RPSType }
  | { type: 'RESTART' };

// [BLOCK: Validation Helpers]
// [Card Scarcity] Still used by PLACE_AI_CARDS' defensive "already fully
// placed" guard below — unrelated to the readiness checks further down,
// which now use getPlacementCap instead (a side may never legitimately
// reach "all 3 slots filled" in a scarce round, and that's fine).
function allSlotsPlaced(slots: BoardSlots): boolean {
  return SLOT_KEYS.every((k) => slots[k].card !== null);
}

// [Card Scarcity] A side is done placing for the round once it's filled
// exactly as many slots as its own placement cap allows — normally 3, but
// possibly fewer once its stack is empty and hand can't reach 3 either
// (see types/game.ts's getPlacementCap doc comment). Used by both
// START_REVEAL and REVEAL_ROUND's own defensive re-check below.
function hasFinishedPlacing(hand: Card[], slots: BoardSlots): boolean {
  const filled = SLOT_KEYS.filter((k) => slots[k].card !== null).length;
  return filled === getPlacementCap(hand, slots);
}

function countCards(state: GameState, owner: 'player' | 'ai'): number {
  if (owner === 'player') {
    return state.playerStack.length + state.playerHand.length;
  }
  return state.aiStack.length + state.aiHand.length;
}

// [BLOCK: Reducer]
function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {

    // -- Draw cards from stack to fill hand to 5
    case 'DRAW_CARDS': {
      if (state.phase !== 'draw') return state;

      const { hand: playerHand, stack: playerStack } = drawToFill(
        state.playerHand,
        state.playerStack,
        HAND_SIZE
      );
      const { hand: aiHand, stack: aiStack } = drawToFill(
        state.aiHand,
        state.aiStack,
        HAND_SIZE
      );

      return {
        ...state,
        playerHand,
        playerStack,
        aiHand,
        aiStack,
        phase: 'placement',
      };
    }

    // -- Player places a card into a slot (face-down)
    // [Card Scarcity] The CARDS_TO_PLACE cap here is unrelated to
    // scarcity — it's just "there are only 3 physical slots," which is
    // still true regardless of hand size. A genuinely short hand already
    // self-limits (there's nothing left to select once the hand is
    // empty), so no cap-related change is needed in this action itself —
    // only the READINESS checks (START_REVEAL, and canConfirm in App.tsx)
    // needed to change, since "all 3 filled" is no longer the right bar
    // once a side's cap is below 3.
    case 'PLACE_CARD': {
      if (state.phase !== 'placement') return state;

      const { slotKey, card } = action;
      const alreadyPlaced = SLOT_KEYS.filter(
        (k) => state.playerSlots[k].card !== null
      ).length;

      if (alreadyPlaced >= CARDS_TO_PLACE) return state;
      if (state.playerSlots[slotKey].card !== null) return state;

      return {
        ...state,
        playerHand: state.playerHand.filter((c) => c.id !== card.id),
        playerSlots: {
          ...state.playerSlots,
          [slotKey]: { key: slotKey, card, state: 'placed' },
        },
      };
    }

    // -- Player removes a card from a slot back to hand
    case 'REMOVE_CARD': {
      if (state.phase !== 'placement') return state;

      const { slotKey } = action;
      const slot = state.playerSlots[slotKey];
      if (!slot.card) return state;

      return {
        ...state,
        playerHand: [...state.playerHand, slot.card],
        playerSlots: {
          ...state.playerSlots,
          [slotKey]: { key: slotKey, card: null, state: 'empty' },
        },
      };
    }

    // -- [Dev Test Mode] Player places/removes exactly one AI card at a
    //    time — mirrors PLACE_CARD/REMOVE_CARD above exactly, just against
    //    aiSlots/aiHand instead. Lets a tester edit an occupied AI slot the
    //    same way they'd edit their own (remove, then place a different
    //    hand card) — see App.tsx's handleAiSlotClick/handleAiCardClick.
    //    Distinct from the bulk PLACE_AI_CARDS case below, which only the
    //    AI's own placement timer dispatches.
    case 'PLACE_AI_CARD': {
      if (state.phase !== 'placement') return state;

      const { slotKey, card } = action;
      const alreadyPlaced = SLOT_KEYS.filter(
        (k) => state.aiSlots[k].card !== null
      ).length;

      if (alreadyPlaced >= CARDS_TO_PLACE) return state;
      if (state.aiSlots[slotKey].card !== null) return state;

      return {
        ...state,
        aiHand: state.aiHand.filter((c) => c.id !== card.id),
        aiSlots: {
          ...state.aiSlots,
          [slotKey]: { key: slotKey, card, state: 'placed' },
        },
      };
    }

    case 'REMOVE_AI_CARD': {
      if (state.phase !== 'placement') return state;

      const { slotKey } = action;
      const slot = state.aiSlots[slotKey];
      if (!slot.card) return state;

      return {
        ...state,
        aiHand: [...state.aiHand, slot.card],
        aiSlots: {
          ...state.aiSlots,
          [slotKey]: { key: slotKey, card: null, state: 'empty' },
        },
      };
    }

    // -- AI places its 3 cards. Now fires on its own ~2s-after-round-start
    //    timer (see App.tsx) rather than only in response to the player's
    //    confirm click — so it no longer requires the player's slots to be
    //    filled, and no longer advances phase itself. Guarded against
    //    double-firing for a round that's already placed (defensive; the
    //    timer that dispatches this already guards per-round via a ref).
    //    [Card Scarcity] `placements` may legitimately cover fewer than 3
    //    slots now — randomAIPlacement/smartAIPlacement (logic/ai.ts)
    //    already leave a slot unfilled gracefully once the AI's own hand
    //    runs out, same mechanism that already supported Dev Test Mode's
    //    partial-fill case. Nothing here needs to change to support that;
    //    this reducer already only ever touches slots actually present in
    //    `placements`.
    case 'PLACE_AI_CARDS': {
      if (state.phase !== 'placement') return state;
      if (allSlotsPlaced(state.aiSlots)) return state;

      const { placements } = action;
      const aiSlots: BoardSlots = { ...state.aiSlots };

      // Only touch slots actually present in placements — a partial fill
      // (see the action type's doc comment) must leave any already-placed
      // slot (from Dev Test Mode's manual placement) untouched rather than
      // stomping it with an undefined card.
      for (const key of SLOT_KEYS) {
        const card = placements[key];
        if (card) {
          aiSlots[key] = { key, card, state: 'placed' };
        }
      }

      const placedCards = Object.values(placements).filter((c): c is Card => !!c);
      const placedIds = new Set(placedCards.map((c) => c.id));
      const aiHand = state.aiHand.filter((c) => !placedIds.has(c.id));

      return {
        ...state,
        aiHand,
        aiSlots,
      };
    }

    // -- Advances placement -> reveal. Split out from PLACE_AI_CARDS (which
    //    used to do both) now that the AI places on its own timer instead
    //    of in response to this moment — this is the player's Play click,
    //    gated on BOTH sides having finished placing.
    //    [Card Scarcity] Previously required allSlotsPlaced (literally 3)
    //    for both sides. Replaced with hasFinishedPlacing, which compares
    //    against each side's OWN placement cap — normally still 3, but
    //    correctly allows fewer once a side's stack is empty and hand
    //    can't reach 3 (see types/game.ts's getPlacementCap). App.tsx's
    //    canConfirm mirrors this exact same check to keep the button
    //    disabled/enabled in sync with what this reducer will actually
    //    accept.
    case 'START_REVEAL': {
      if (state.phase !== 'placement') return state;
      if (!hasFinishedPlacing(state.playerHand, state.playerSlots)) return state;
      if (!hasFinishedPlacing(state.aiHand, state.aiSlots)) return state;

      return {
        ...state,
        phase: 'reveal',
      };
    }

    // -- Resolve all 3 slots (single source of truth for this round's lane
    //    outcomes), then run the cascade on top of that same resolution
    //    (single source of truth for the round's cascade outcome too).
    //    Both are stored in pendingResolution / pendingCascade rather than
    //    recomputed later — resolveSlot() mutates card.exhausted in place,
    //    both for lane resolution AND for cascade fights, so re-running
    //    either a second time on the same card objects would corrupt
    //    already-exhausted pairs (see GameState.pendingResolution /
    //    pendingCascade doc comments in types/game.ts).
    //    History is recorded later via RECORD_HISTORY so it doesn't spoil
    //    the reveal animation; survivor cycling happens later via
    //    NEXT_ROUND.
    //    [Card Scarcity] Guard below mirrors START_REVEAL's own
    //    hasFinishedPlacing check — defensive re-validation in case this
    //    ever fires without START_REVEAL having run first (it shouldn't,
    //    but the previous allSlotsPlaced-based guard was already just
    //    defensive in the same way).
    case 'REVEAL_ROUND': {
      if (state.phase !== 'reveal') return state;
      if (!hasFinishedPlacing(state.playerHand, state.playerSlots)) return state;
      if (!hasFinishedPlacing(state.aiHand, state.aiSlots)) return state;

      const resolution = resolveRound(state.playerSlots, state.aiSlots);
      const dragonPlayed = roundHasDragon(resolution);
      const cascade = resolveCascade(resolution, dragonPlayed);

      // [SUB-BLOCK: Cascade Relabeling]
      // resolveCascade() above still reads the RAW resolution — it needs
      // 'won' labels intact to find lane-winners via collectWonEntries —
      // so this relabeling happens strictly AFTER that call, never before.
      // Any lane a cascade fight overrode gets its outcome flipped from
      // 'won' to 'cascaded': mechanically identical to 'lost' for survivor
      // cycling (see combat.ts's getSurvivors, which only ever counts
      // 'won'/'tied'), but reads correctly as "won its matchup, then fell
      // in the cascade" rather than a plain loss (see types/game.ts's
      // CombatOutcome doc comment). This relabeled object becomes the
      // SINGLE version of this round's resolution from here on — stored in
      // pendingResolution and read by RECORD_HISTORY, NEXT_ROUND, and
      // App.tsx's return-flight builder alike, so none of them need to
      // separately cross-reference cascade.overrides anymore.
      const cascadedPlayerKeys = new Set(
        cascade.overrides.filter((o) => o.owner === 'player').map((o) => o.slotKey)
      );
      const cascadedAiKeys = new Set(
        cascade.overrides.filter((o) => o.owner === 'ai').map((o) => o.slotKey)
      );

      const resolvedWithCascade: RoundResolution = { ...resolution };
      for (const key of SLOT_KEYS) {
        const r = resolution[key];
        resolvedWithCascade[key] = {
          ...r,
          player: cascadedPlayerKeys.has(key) ? 'cascaded' : r.player,
          ai: cascadedAiKeys.has(key) ? 'cascaded' : r.ai,
        };
      }

      // Apply the (now cascade-aware) lane outcomes to slot states.
      // [Card Scarcity] 'empty' is already a valid SlotState (reused from
      // its pre-placement meaning — see types/game.ts's doc comment), so
      // this assignment needs no special-casing even when player/ai is
      // 'empty' for a given slot.
      const playerSlots: BoardSlots = { ...state.playerSlots };
      const aiSlots: BoardSlots = { ...state.aiSlots };

      for (const key of SLOT_KEYS) {
        const { player, ai } = resolvedWithCascade[key];
        playerSlots[key] = { ...playerSlots[key], state: player };
        aiSlots[key] = { ...aiSlots[key], state: ai };
      }

      // Update Smart AI pattern tracking — Dragon plays are excluded
      // (ai-behavior.md defines no pattern behavior for it; patternHistory
      // is typed to RPS types only, see types/game.ts). This tracks what
      // the player PLACED, not the cascade outcome, so it's unaffected by
      // cascade fights. [Card Scarcity] Guarded on the player actually
      // having a card in this slot — a scarce round may leave a slot
      // genuinely empty, which is simply not a data point to record,
      // rather than an error.
      const patternHistory = { ...state.ai.patternHistory };
      if (state.ai.difficulty === 'smart' && !state.ai.confidenceDisrupted) {
        for (const key of SLOT_KEYS) {
          const playedType = state.playerSlots[key].card?.type;
          if (playedType && playedType !== 'Dragon') {
            patternHistory[key] = [...patternHistory[key], playedType];
          }
        }
      }

      // Update cards seen by AI — Dragon excluded (single-use, untracked;
      // see ai-behavior.md and ai.ts). [Card Scarcity] Same guard as
      // above — an empty slot has no played type to record.
      const playerCardsSeen = { ...state.ai.playerCardsSeen };
      for (const key of SLOT_KEYS) {
        const playedType = state.playerSlots[key].card?.type;
        if (playedType && playedType !== 'Dragon') {
          playerCardsSeen[playedType]++;
        }
      }

      return {
        ...state,
        playerSlots,
        aiSlots,
        pendingResolution: resolvedWithCascade,
        pendingCascade: cascade,
        ai: {
          ...state.ai,
          patternHistory,
          playerCardsSeen,
          confidenceDisrupted: false,
        },
        phase: 'resolution',
      };
    }

    // -- Build and push the round history entry, using the resolution and
    //    cascade already computed by REVEAL_ROUND (not recomputed).
    //    Deferred until after the reveal animation plays so history
    //    doesn't spoil outcomes early (see ROADMAP.md history-timing note).
    //    [Card Scarcity] playerSlots/aiSlots.card can be null now for a
    //    slot that was never filled this round — `?.type ?? null` replaces
    //    the previous `.card!.type` non-null assertion (which would have
    //    crashed on a genuinely empty slot). RoundHistory.tsx displays
    //    '—' for a null entry.
    case 'RECORD_HISTORY': {
      if (!state.pendingResolution) return state;

      const resolution = state.pendingResolution;
      const cascade = state.pendingCascade;
      const dragonInfo = getDragonInfo(resolution);

      const historyEntry: RoundHistoryEntry = {
        round: state.round,
        playerSlots: {
          left:   state.playerSlots.left.card?.type ?? null,
          center: state.playerSlots.center.card?.type ?? null,
          right:  state.playerSlots.right.card?.type ?? null,
        },
        aiSlots: {
          left:   state.aiSlots.left.card?.type ?? null,
          center: state.aiSlots.center.card?.type ?? null,
          right:  state.aiSlots.right.card?.type ?? null,
        },
        resolutions: {
          left:   { player: resolution.left.player,   ai: resolution.left.ai },
          center: { player: resolution.center.player, ai: resolution.center.ai },
          right:  { player: resolution.right.player,  ai: resolution.right.ai },
        },
        playerCardsAfter: countCards(state, 'player'),
        aiCardsAfter: countCards(state, 'ai'),
        cascade: cascade
          ? {
              triggered: cascade.triggered,
              log: cascade.log,
              survivingSlots: cascade.survivingSlots,
              roundWinner: getCascadeRoundWinner(cascade),
            }
          : null,
        dragonSide: dragonInfo?.side ?? null,
        dragonSlot: dragonInfo?.slotKey ?? null,
      };

      return {
        ...state,
        roundHistory: [...state.roundHistory, historyEntry],
      };
    }

    // -- Cycle survivors to stack bottom, route everyone else to that
    //    side's discard pile, reset slots, advance round.
    //    Uses the stored resolution from REVEAL_ROUND (not a fresh
    //    resolveRound() call — see GameState.pendingResolution), then
    //    strips out any card the cascade discarded on top of that.
    //    [Card Scarcity] placedPlayerCards/placedAiCards can now contain
    //    null entries (a slot that was never filled this round) — filtered
    //    out before discard routing, since there's no card there to
    //    discard.
    case 'NEXT_ROUND': {
      if (state.phase !== 'resolution') return state;
      if (!state.pendingResolution) return state;

      // getSurvivors() only ever counts 'won'/'tied' outcomes. Since
      // pendingResolution is now the cascade-relabeled version built in
      // REVEAL_ROUND's Cascade Relabeling sub-block, any lane a cascade
      // fight overrode already reads 'cascaded' here, not 'won' — so it's
      // excluded automatically, with no separate cross-reference against
      // pendingCascade.overrides needed anymore.
      const resolution = state.pendingResolution;
      const {
        playerSurvivors: finalPlayerSurvivors,
        aiSurvivors: finalAiSurvivors,
      } = getSurvivors(resolution);

      // [SUB-BLOCK: Discard routing]
      // Everything that was placed this round but isn't a final survivor
      // goes to that side's discard pile — covers lost, tied-lost, dragon,
      // and cascade-overridden won cards in one pass, without touching
      // combat/survivor logic above. Purely presentational bookkeeping
      // (see GameState.playerDiscard/aiDiscard doc comment). Null entries
      // (slots with no card this round) are filtered out first — nothing
      // to discard for a lane that never had a card in it.
      const placedPlayerCards = SLOT_KEYS
        .map((k) => resolution[k].playerCard)
        .filter((c): c is Card => c !== null);
      const placedAiCards = SLOT_KEYS
        .map((k) => resolution[k].aiCard)
        .filter((c): c is Card => c !== null);

      const survivorPlayerIds = new Set(finalPlayerSurvivors.map((c) => c.id));
      const survivorAiIds = new Set(finalAiSurvivors.map((c) => c.id));

      const newPlayerDiscards = placedPlayerCards.filter((c) => !survivorPlayerIds.has(c.id));
      const newAiDiscards = placedAiCards.filter((c) => !survivorAiIds.has(c.id));

      // [Top-of-Stack Return] Survivors now go to the TOP of the stack
      // (prepended) rather than the bottom — drawToFill (logic/deck.ts)
      // always draws from the front of this array, so a card returned
      // here is the very next one drawn next time, not something that
      // resurfaces many rounds later. This is what gives Shuffle real
      // purpose: leaving a stack un-shuffled means recently-played cards
      // come right back around; shuffling scrambles that predictability
      // away. getSurvivors already returns each side's survivors in
      // Left->Center->Right order (it walks SLOT_KEYS in that order), so
      // prepending them in that same order means Left's survivor (if
      // any) becomes the single next card drawn, Center's second, Right's
      // third — matching the reveal/cascade order convention used
      // everywhere else in the codebase.
      const playerStack = [...finalPlayerSurvivors, ...state.playerStack];
      const aiStack = [...finalAiSurvivors, ...state.aiStack];

      const nextRound = state.round + 1;
      const isGameOver = nextRound > TOTAL_ROUNDS;

      // Calculate result if game is over
      let result: GameState['result'] = null;
      if (isGameOver) {
        const playerScore = playerStack.length + state.playerHand.length;
        const aiScore = aiStack.length + state.aiHand.length;
        result = playerScore > aiScore ? 'player' : aiScore > playerScore ? 'ai' : 'draw';
      }

      return {
        ...state,
        round: nextRound,
        phase: isGameOver ? 'gameover' : 'draw',
        playerStack,
        playerHand: state.playerHand,
        playerSlots: makeEmptySlots(),
        aiStack,
        aiHand: state.aiHand,
        aiSlots: makeEmptySlots(),
        playerDiscard: [...state.playerDiscard, ...newPlayerDiscards],
        aiDiscard: [...state.aiDiscard, ...newAiDiscards],
        pendingResolution: null,
        pendingCascade: null,
        result,
      };
    }

    // -- Player shuffles their stack (breaks Smart AI confidence)
    case 'SHUFFLE_STACK': {
      if (state.phase === 'reveal' || state.phase === 'gameover') return state;

      return {
        ...state,
        playerStack: shuffleStack(state.playerStack),
        ai: {
          ...state.ai,
          confidenceDisrupted: true,
        },
      };
    }

    // -- Change AI difficulty (takes effect next round)
    case 'SET_DIFFICULTY': {
      return {
        ...state,
        ai: {
          ...state.ai,
          difficulty: action.difficulty,
        },
      };
    }

    // -- Toggle Dev Test Mode (Phase 1: reveals the AI's hand; later phases
    //    add stack inspection + hand editing). Does not affect AI placement
    //    logic — see dev-test-mode-plan.md.
    case 'SET_DEV_MODE': {
      return {
        ...state,
        devMode: action.devMode,
      };
    }

    // -- [Dev Test Mode — Phase 2: Hand Swap]
    //    Swaps one hand card (not yet placed) for a card of newType, pulled
    //    from that SAME owner's stack — never crosses player/AI pools, per
    //    dev-test-mode-plan.md's "same-side, same-pool only" constraint.
    //    Gated on 'placement' phase only (per the plan's design note:
    //    "it only affects what ends up in hand before placement" — existing
    //    systems like exhausted flags, cascade, and pattern tracking are
    //    otherwise untouched). No-ops (returns state unchanged) if the
    //    card isn't found in that owner's hand, or if that owner's stack
    //    has no card of the requested type — mirrors CardTypePicker's own
    //    "(0 left)" disabled-option guard, just re-checked here in case
    //    stack contents shifted between render and dispatch.
    //
    //    The outgoing hand card is shuffled back into the stack (rather
    //    than pushed to a fixed position) so a tester swapping cards
    //    doesn't get a side-effect of also making that card's next-draw
    //    position predictable — this is a design assumption for a dev-only
    //    tool, not a rule stated in card-systems.md, flagged here rather
    //    than silently decided. exhausted flags are left untouched on both
    //    the outgoing and incoming card — this tool moves cards, it never
    //    resets match state.
    case 'DEV_SWAP_HAND_CARD': {
      if (state.phase !== 'placement') return state;

      const { owner, cardId, newType } = action;
      const hand = owner === 'player' ? state.playerHand : state.aiHand;
      const stack = owner === 'player' ? state.playerStack : state.aiStack;

      const handIndex = hand.findIndex((c) => c.id === cardId);
      if (handIndex === -1) return state;

      const stackIndex = stack.findIndex((c) => c.type === newType);
      if (stackIndex === -1) return state; // requested type unavailable in this side's stack

      const outgoingCard = hand[handIndex];
      const incomingCard = stack[stackIndex];

      const newHand = [...hand];
      newHand[handIndex] = incomingCard;

      const stackWithoutIncoming = [
        ...stack.slice(0, stackIndex),
        ...stack.slice(stackIndex + 1),
      ];
      const newStack = shuffleStack([...stackWithoutIncoming, outgoingCard]);

      return owner === 'player'
        ? { ...state, playerHand: newHand, playerStack: newStack }
        : { ...state, aiHand: newHand, aiStack: newStack };
    }

    // -- [Dev Test Mode — Phase 3: Direct Stack Editing]
    //    Swaps a card already sitting IN a stack for a different type, by
    //    exchanging its position with another card of that type elsewhere
    //    in the SAME stack — never adds, removes, or fabricates a card
    //    (see getStackTypeCounts(stack, excludeId) in deck.ts, which
    //    already excludes the card being edited from its own counts for
    //    exactly this reason). Gated the same way SHUFFLE_STACK is (any
    //    phase except 'reveal'/'gameover') rather than 'placement' only —
    //    confirmed scope for this phase. No-ops if the card isn't found in
    //    that owner's stack, or if there's no OTHER card of newType there
    //    to swap with (mirrors CardTypePicker's own disabled-option guard,
    //    re-checked here in case stack contents shifted between render and
    //    dispatch). exhausted flags on both cards are left untouched.
    case 'DEV_SWAP_STACK_CARD': {
      if (state.phase === 'reveal' || state.phase === 'gameover') return state;

      const { owner, cardId, newType } = action;
      const stack = owner === 'player' ? state.playerStack : state.aiStack;

      const cardIndex = stack.findIndex((c) => c.id === cardId);
      if (cardIndex === -1) return state;

      const swapIndex = stack.findIndex((c, i) => i !== cardIndex && c.type === newType);
      if (swapIndex === -1) return state; // no other card of that type in this stack

      const newStack = [...stack];
      [newStack[cardIndex], newStack[swapIndex]] = [newStack[swapIndex], newStack[cardIndex]];

      return owner === 'player'
        ? { ...state, playerStack: newStack }
        : { ...state, aiStack: newStack };
    }

    // -- Restart the game entirely
    case 'RESTART': {
      return makeInitialState(state.ai.difficulty);
    }

    default:
      return state;
  }
}

// [BLOCK: Hook]
export function useGameState(initialDifficulty: AIDifficulty = 'random') {
  const [state, dispatch] = useReducer(gameReducer, undefined, () =>
    makeInitialState(initialDifficulty)
  );

  return { state, dispatch };
}