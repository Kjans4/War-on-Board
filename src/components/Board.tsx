// src/components/Board.tsx

import { useState } from 'react';
import type { CSSProperties } from 'react';
import clsx from 'clsx';
import type { BoardSlots, SlotKey, Card as CardType, Owner, RPSType, CascadeResult } from '../types/game';
import { SLOT_KEYS } from '../types/game';
import { Slot } from './Slot';
import { Card } from './Card';
import { StackInspector } from './StackInspector';
import { CardTypePicker, CardEditButton } from './CardTypePicker';
import { getStackTypeCounts } from '../logic/deck';
import styles from '../styles/Board.module.css';

// [BLOCK: Reveal Step Type]
// Exported so App.tsx can type its local animation state.
// null          = not in reveal sequence (placement or post-resolution)
// flipping      = Play clicked, all cards flip face-down (2s pause before reveal starts)
// left          = left slot revealing
// center        = left + center revealed
// right         = all 3 slots revealed
// phase1Resolve = [Battle Phases] "Phase 1" resolve beat — fires the flight
//   animation for lanes that are final and never touched by a cascade
//   (lost/tied-lost/tied). Purely a flight-timing marker now — see the
//   "Instant Per-Slot Badges" pass below: badges themselves no longer wait
//   for this step, they already popped in alongside their slot's own
//   left/center/right flip.
// cascadeFight  = [Battle Phases] one beat per cascade.log entry, fired
//   sequentially by App.tsx alongside a matching cascadeFightIndex. The
//   two lanes contesting THAT SPECIFIC beat get a glow accent (see
//   isCurrentCascadeFightSlot), and the beat's loser's badge flips from its
//   provisional "Win" to its true final label ("Cascaded") right here (see
//   hasCascadeLaneResolved / the display-override block in the render
//   loops below) — the winner keeps showing "Win" provisionally, since it
//   may still be challenged again in a later beat.
// dragonOverlay = [Instant Dragon Reveal] all 3 revealed, "Dragon Attack"
//   banner showing (Dragon rounds only) — outcome badges pop in at this
//   SAME beat now (see slotVisuals' isDragonRound branch below), so the
//   banner and the win/loss declaration read as one simultaneous moment
//   instead of the banner playing over blank cards first.
// done          = all revealed, every remaining badge shows (final
//   catch-all for any cascade survivor never individually eliminated, and
//   for Dragon rounds the badges are already showing by this point —
//   'done' just holds them), awaiting Next Round
export type RevealStep =
  | null
  | 'flipping'
  | 'left'
  | 'center'
  | 'right'
  | 'phase1Resolve'
  | 'cascadeFight'
  | 'dragonOverlay'
  | 'done';

// [BLOCK: Cascade Participation Helper]
// [Battle Phases] Determines whether a given (owner, slotKey) lane entered
// the cascade fight at all this round — i.e. whether its badge should show
// a PROVISIONAL "Win" (see the display-override block in the render loops
// below) rather than its true final label the instant its slot reveals.
//
// Deliberately reads ONLY pendingCascade's own overrides/survivingSlots —
// never re-derives lane-winners itself (that would mean re-running
// collectWonEntries/resolveCascade logic here, duplicating combat.ts and
// risking drift). overrides + survivingSlots together are EXACTLY the set
// of lanes resolveCascade() collected as entries in the first place (every
// entry ends up in exactly one of the two arrays — see combat.ts's
// resolveCascade), so their union is a safe, already-computed proxy for
// "this lane won its RPS matchup and went on to the cascade."
//
// Guarded on cascade.triggered: when it's false (0 or 1 lane-winners this
// round, or a Dragon round where cascade never runs at all), there was no
// real fight regardless of what's sitting in survivingSlots — the sole
// winner (if any) is just final as 'won', not cascade-pending, so it
// never needs the provisional-label treatment at all.
function isCascadePending(
  cascade: CascadeResult | null,
  owner: Owner,
  slotKey: SlotKey
): boolean {
  if (!cascade || !cascade.triggered) return false;
  const key = `${slotKey}-${owner}`;
  const inOverrides = cascade.overrides.some((o) => `${o.slotKey}-${o.owner}` === key);
  if (inOverrides) return true;
  return cascade.survivingSlots.some((s) => `${s.slotKey}-${s.owner}` === key);
}

// [BLOCK: Per-Fight Resolution Helper]
// [Battle Phases — Phase 3 / Instant Per-Slot Badges]
// For a cascade-pending lane, determines whether IT SPECIFICALLY has
// already lost its own cascade fight by the current beat
// (cascadeFightIndex) — i.e. whether its badge should flip from the
// provisional "Win" it's been showing since its slot first revealed, over
// to its true final label ("Cascaded"). Only ever meaningful while
// stepping through cascade.log in order (indices 0..cascadeFightIndex
// inclusive) — a lane that's still winning (or hasn't fought yet)
// deliberately keeps showing "Win" here even after its own beat, since a
// persisting champion could still fall to a LATER challenger; only the
// eliminated side of a resolved fight is ever reported true.
//
// [Design note — Win-First Reveal] Per explicit design direction this
// session, lanes now show "Win" the instant they're revealed and only
// flip to "Cascaded" once they're actually eliminated — the reverse of
// the previous no-spoiler policy (which withheld the badge entirely until
// a lane's fate was fully known). See the display-override block in the
// render loops below for where the provisional label is applied.
function hasCascadeLaneResolved(
  cascade: CascadeResult | null,
  cascadeFightIndex: number | null,
  owner: Owner,
  slotKey: SlotKey
): boolean {
  if (!cascade || cascadeFightIndex === null) return false;
  const target = `${slotKey}-${owner}`;

  for (let i = 0; i <= cascadeFightIndex && i < cascade.log.length; i++) {
    const entry = cascade.log[i];
    const championKey = `${entry.championSlot}-${entry.championOwner}`;
    const challengerKey = `${entry.challengerSlot}-${entry.challengerOwner}`;

    if (entry.outcome === 'championWon' && challengerKey === target) return true;
    if (entry.outcome === 'challengerWon' && championKey === target) return true;
    if (entry.outcome === 'tiedLost' && (championKey === target || challengerKey === target)) return true;
    // plain 'tied' eliminates neither side — both withdraw as survivors,
    // so it never marks either lane "resolved" here; they keep showing
    // "Win" until 'done' reconciles them (harmlessly — they finish as
    // 'won' anyway, never overridden).
  }

  return false;
}

// [BLOCK: Current Fight Glow Helper]
// [Battle Phases — Phase 3] True for exactly the two slots (always one per
// owner — see combat.ts's resolveCascade, which only ever fights across
// owners, never same-owner) contesting the fight at cascade.log[index],
// where index === cascadeFightIndex (the beat currently playing, not any
// earlier or later one). Purely a visual accent — see Slot.tsx's
// fightGlow prop / CascadeGlow.module.css.
function isCurrentCascadeFightSlot(
  cascade: CascadeResult | null,
  cascadeFightIndex: number | null,
  owner: Owner,
  slotKey: SlotKey
): boolean {
  if (!cascade || cascadeFightIndex === null) return false;
  const entry = cascade.log[cascadeFightIndex];
  if (!entry) return false;

  return (
    (entry.championSlot === slotKey && entry.championOwner === owner) ||
    (entry.challengerSlot === slotKey && entry.challengerOwner === owner)
  );
}

// [BLOCK: Per-slot visual state — Instant Per-Slot Badges]
// Given the current reveal step, returns whether each slot should be shown
// face-down and whether its outcome badge/glow should be visible.
//
// [Design note — this session] Previously badges were withheld until
// phase1Resolve/cascadeFight/done regardless of how far the card-flip
// stagger had progressed — "all 3 cards battle" read as one simultaneous
// beat, then results trickled in afterward. Per explicit design direction
// this session, that's reversed for non-Dragon rounds: a slot's badge now
// rides along with THAT SLOT'S OWN flip — Left shows its win/loss the
// instant Left flips face-up, without waiting for Center/Right. Dragon
// rounds are the one exception (see the isDragonRound branch below) — the
// banner and every badge still appear together, at the dragonOverlay beat,
// rather than each slot popping independently.
//
// Non-Dragon rules now:
//   - flipping: nothing revealed yet, no badges.
//   - left/center/right: cards flip face-up per the existing stagger, and
//     each slot's badge appears the moment THAT slot flips. A cascade-
//     pending lane's badge is a PROVISIONAL "Win" at this point — see the
//     display-override block in the render loops below, which is what
//     actually swaps the label to "Cascaded" once that lane is eliminated.
//   - phase1Resolve/cascadeFight/done: all 3 already revealed by 'right',
//     so these later steps are just "still revealed" — no visual change
//     from this function's point of view (cascade label swaps happen via
//     the display-override block, not here).
//
// Dragon rounds:
//   - flipping/left/center/right: cards flip per buildDragonTimeline's
//     jump-ahead schedule, no badges yet.
//   - dragonOverlay/done: fully revealed AND badges shown — banner and
//     win/loss declaration land together at dragonOverlay, done just
//     holds that same state.
function slotVisuals(
  slotKey: SlotKey,
  revealStep: RevealStep,
  hasCard: boolean,
  hideDuringPlacement: boolean,
  isDragonRound: boolean,
): { visuallyFaceDown: boolean; showOutcome: boolean } {
  if (revealStep === null) {
    // Pre-reveal — either mid-placement, or the brief gap between rounds.
    // The player always sees their own placement (hideDuringPlacement is
    // only ever true for the opponent's slots — see Board's call sites
    // below). The opponent's placed-but-unrevealed card stays hidden here
    // too: since the AI now places on its own ~2s timer independently of
    // when the player finishes (see App.tsx), without this its card would
    // flash face-up the instant that timer fires, well before the player
    // has even finished their own placement — breaking the whole
    // simultaneous-reveal/bluff premise the game is built on.
    return { visuallyFaceDown: hasCard && hideDuringPlacement, showOutcome: false };
  }

  if (!hasCard) {
    return { visuallyFaceDown: false, showOutcome: false };
  }

  const ORDER: SlotKey[] = ['left', 'center', 'right'];
  const slotIndex = ORDER.indexOf(slotKey);

  if (isDragonRound) {
    // Banner + every badge land together at dragonOverlay; done just
    // holds that same revealed/shown state.
    if (revealStep === 'dragonOverlay' || revealStep === 'done') {
      return { visuallyFaceDown: false, showOutcome: true };
    }

    // flipping/left/center/right — card-flip stagger only, per
    // buildDragonTimeline's jump-ahead schedule. No badges yet.
    const stepIndex: Record<string, number> = { flipping: -1, left: 0, center: 1, right: 2 };
    const revealedUpTo = stepIndex[revealStep] ?? -1;
    const revealed = slotIndex <= revealedUpTo;
    return { visuallyFaceDown: !revealed, showOutcome: false };
  }

  // Non-Dragon — badge rides along with this slot's own flip. Every step
  // from 'left' onward (including phase1Resolve/cascadeFight/done, which
  // all occur after 'right') counts as "fully staggered past", so default
  // any of those later-named steps to fully revealed.
  const stepIndex: Record<string, number> = {
    flipping: -1,
    left: 0,
    center: 1,
    right: 2,
    phase1Resolve: 2,
    cascadeFight: 2,
    done: 2,
  };
  const revealedUpTo = stepIndex[revealStep] ?? 2;
  const revealed = slotIndex <= revealedUpTo;

  return {
    visuallyFaceDown: !revealed,
    showOutcome: revealed,
  };
}

// [BLOCK: Props]
interface BoardProps {
  playerSlots: BoardSlots;
  aiSlots: BoardSlots;
  aiHand: CardType[];
  revealStep: RevealStep;
  selectedCardId: string | null;
  onSlotClick: (slotKey: SlotKey) => void;
  placementActive: boolean;
  // [Dev Test Mode] Manual AI hand/slot editing — mirrors selectedCardId/
  // onSlotClick above, but for the AI's own side. Only meaningful (and
  // only wired to be clickable) while devMode is on and at least one AI
  // slot is still empty — see Board's internal aiEditable and App.tsx's
  // handleAiCardClick/handleAiSlotClick.
  selectedAiCardId?: string | null;
  onAiCardClick?: (card: CardType) => void;
  onAiSlotClick?: (slotKey: SlotKey) => void;
  // [Dev Test Mode — Phase 2] Swap an AI hand card (still unplaced) for a
  // different type, pulled from the AI's own stack — mirrors Hand.tsx's
  // onSwapCard for the player side. newType is RPSType only; Dragon is
  // excluded from the picker (see CardTypePicker.tsx). Optional/inert
  // outside devMode, same convention as onAiCardClick/onAiSlotClick above.
  onAiSwapCard?: (cardId: string, newType: RPSType) => void;
  // [Layout] playerStackCount/onShuffleStack/canShuffle/playerStack removed
  // from Board's props — the player's stack icon + shuffle button now
  // render next to <Hand> in App.tsx instead of inside the battlefield row
  // (see the new PlayerStackControls.tsx). The player's Discard pile stays
  // here, unchanged.
  aiStackCount: number;
  playerDiscardCount: number;
  aiDiscardCount: number;
  // Set only when exactly one side played a Dragon this round — drives the
  // "Dragon Attack" banner. null the rest of the time (including
  // both-sides-Dragon rounds, which cancel rather than wipe).
  dragonOverlayOwner: Owner | null;
  // [Battle Phases] The round's already-computed cascade result (or null
  // pre-reveal / post-round-end) — read-only, used purely to determine
  // per-lane cascade participation for slotVisuals via isCascadePending /
  // hasCascadeLaneResolved / isCurrentCascadeFightSlot above. Never used
  // to derive outcome labels themselves (those still come from each
  // Slot's own `state`, set by the reducer) — only to decide WHEN a
  // lane's already-known outcome is allowed to show, and which slots glow.
  pendingCascade: CascadeResult | null;
  // [Battle Phases — Phase 3] Which cascade.log entry is currently
  // playing (0-based), or null when no cascade fight beat is in progress
  // (before/after the cascade, or a round with no cascade at all).
  cascadeFightIndex: number | null;
  // [Dev Test Mode — Phase 1] When true, the AI's hand renders face-up
  // instead of face-down. See dev-test-mode-plan.md. Does not affect any
  // combat/reveal logic — purely a visibility toggle over the opponent
  // hand row.
  devMode?: boolean;
  // [Dev Test Mode — Phase 1: Stack Inspector / Phase 2: Hand Swap]
  // The AI's own stack contents — used by devMode's AI stack-icon click
  // (read-only inspector) AND as the source of per-type remaining counts
  // for the AI hand swap-picker (getStackTypeCounts(aiStack)). The
  // player's stack no longer passes through Board at all (see above) — the
  // player's own inspector now lives in PlayerStackControls.tsx instead.
  aiStack: CardType[];
  // [Dev Test Mode — Phase 3] Whether the Stack Inspector's per-row swap
  // picker is active. Confirmed scope: matches SHUFFLE_STACK's own window
  // exactly (any phase except 'reveal'/'gameover') — see App.tsx's
  // canShuffle, which this is passed the same value as.
  canEditStacks?: boolean;
  // Swaps a card sitting IN the AI's stack (opened via the Stack
  // Inspector) for a different type, by exchanging its position with
  // another card of that type already in that SAME stack — see
  // useGameState.ts's DEV_SWAP_STACK_CARD. No owner param needed here
  // (unlike the pre-layout-change version) — this Board instance only
  // ever opens the AI's own inspector now, so App.tsx fixes owner: 'ai' at
  // the call site.
  onStackSwapCard?: (cardId: string, newType: RPSType) => void;
  // Exposes DOM nodes for stack icons, discard piles, and slots up to
  // App.tsx by key (e.g. 'stack-player', 'discard-ai', 'slot-player-left')
  // so the return-flight animation can measure flight source/destination
  // rects. Purely a measurement hook — no visual effect on its own.
  registerRef?: (key: string, el: HTMLElement | null) => void;
}

// [BLOCK: Opponent Hand Fan]
function fanStyle(index: number, total: number): CSSProperties {
  if (total <= 1) return {};
  const mid = (total - 1) / 2;
  const offset = index - mid;
  return {
    transform: `translateY(${Math.abs(offset) * 5}px) rotate(${offset * 6}deg)`,
    transformOrigin: 'top center',
    marginLeft: index === 0 ? 0 : -22,
    zIndex: total - index,
  };
}

// [BLOCK: Stack Icon]
// [Dev Test Mode — Phase 1] onClick/clickable let App/Board open the Stack
// Inspector panel — only ever wired to be clickable when devMode is on
// (see Board's render below). Normal play never sets these, so the icon
// stays purely decorative/count-display outside dev mode, unchanged from
// before this phase.
function StackIcon({
  count,
  label,
  elRef,
  onClick,
  clickable = false,
}: {
  count: number;
  label: string;
  elRef?: (el: HTMLDivElement | null) => void;
  onClick?: () => void;
  clickable?: boolean;
}) {
  return (
    <div
      className={clsx(styles['stack-col'], clickable && styles['stack-col--clickable'])}
      ref={elRef}
      onClick={clickable ? onClick : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => e.key === 'Enter' && onClick?.() : undefined}
      title={clickable ? `Inspect ${label.toLowerCase()} stack` : undefined}
    >
      <span className={styles['stack-col__count']}>{count}</span>
      <div className={styles['stack-col__icon']} aria-hidden="true" />
      <span className={styles['stack-col__label']}>{label}</span>
    </div>
  );
}

// [BLOCK: Discard Pile]
// Visual home for cards that didn't survive the round — purely a display
// of GameState.playerDiscard/aiDiscard's length, plus a landing point for
// the return-flight animation (see App.tsx's buildReturnFlights).
function DiscardPile({
  count,
  elRef,
}: {
  count: number;
  elRef?: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div className={styles['discard-col']} ref={elRef}>
      <span className={styles['discard-col__count']}>{count}</span>
      <div className={styles['discard-col__icon']} aria-hidden="true" />
      <span className={styles['discard-col__label']}>Discard</span>
    </div>
  );
}

// [BLOCK: Component]
export function Board({
  playerSlots,
  aiSlots,
  aiHand,
  revealStep,
  selectedCardId,
  onSlotClick,
  placementActive,
  selectedAiCardId = null,
  onAiCardClick,
  onAiSlotClick,
  onAiSwapCard,
  aiStackCount,
  playerDiscardCount,
  aiDiscardCount,
  dragonOverlayOwner,
  pendingCascade,
  cascadeFightIndex,
  devMode = false,
  aiStack,
  canEditStacks = false,
  onStackSwapCard,
  registerRef,
}: BoardProps) {
  // [Dev Test Mode — Phase 1: Stack Inspector]
  // Whether the AI's stack panel is currently open. Simplified from a
  // shared Owner|null toggle to a plain boolean now that Board only ever
  // owns the AI-side inspector — the player's own inspector lives in
  // PlayerStackControls.tsx instead (see the [Layout] note on BoardProps).
  const [aiInspectorOpen, setAiInspectorOpen] = useState(false);

  function handleAiStackClick() {
    if (!devMode) return;
    setAiInspectorOpen((prev) => !prev);
  }

  // [Dev Test Mode — Phase 2: AI Hand Swap]
  // Which AI hand card (by id) currently has its type picker open, if
  // any — mirrors Hand.tsx's editingCardId for the player side exactly,
  // just kept here instead since the AI hand row lives in Board, not Hand.
  // Gated on placementActive rather than aiEditable/aiHasPlaced: editing an
  // unplaced hand card is independent of whether AI slots still have room
  // (per dev-test-mode-plan.md's "option B" — manual slot placement AND
  // the swap-picker both apply to AI hand cards simultaneously). A card
  // stops being editable the moment it's actually placed, since placing it
  // removes it from aiHand entirely — no extra guard needed for that.
  const [aiEditingCardId, setAiEditingCardId] = useState<string | null>(null);
  const canEditAiHand = devMode && placementActive && !!onAiSwapCard;
  const aiStackCounts = canEditAiHand ? getStackTypeCounts(aiStack) : null;

  // [Instant Dragon Reveal] Whether this round is a Dragon round at all —
  // drives slotVisuals' isDragonRound branch (badges wait for
  // dragonOverlay instead of riding each slot's own flip). Reusing the
  // same dragonOverlayOwner prop the banner itself keys off, so the two
  // are guaranteed to agree — never derived separately.
  const isDragonRound = dragonOverlayOwner !== null;

  // Overlay shows from the moment the timeline reaches 'dragonOverlay' and
  // lingers through 'done' (so it's still visible while outcome badges
  // hold), then disappears once the round transitions and the caller
  // resets dragonOverlayOwner to null.
  const showDragonOverlay =
    dragonOverlayOwner !== null && (revealStep === 'dragonOverlay' || revealStep === 'done');

  // [Dev Test Mode] Manual AI editing window: only while devMode is on and
  // still in placement — no longer gated on "at least one slot empty".
  // Occupied AI slots must stay clickable so a tester can remove/replace a
  // card the same way they'd edit their own board (see App.tsx's
  // handleAiSlotClick dispatching REMOVE_AI_CARD for an occupied slot).
  const aiEditable = devMode && placementActive;

  return (
    <>
      <div className={styles['battlefield-row']}>

        {/* [SUB-BLOCK: Opponent Stack + Discard — left edge, floats toward opponent's row] */}
        <div className={clsx(styles['stack-col-wrap'], styles['stack-col-wrap--ai'])}>
          <StackIcon
            count={aiStackCount}
            label="Opponent"
            elRef={(el) => registerRef?.('stack-ai', el)}
            onClick={handleAiStackClick}
            clickable={devMode}
          />
          <DiscardPile
            count={aiDiscardCount}
            elRef={(el) => registerRef?.('discard-ai', el)}
          />
        </div>

        {/* [SUB-BLOCK: Battlefield] */}
        <div className={styles.battlefield}>

          {/* Opponent hand — face-down normally; face-up in Dev Test Mode
              (Phase 1) so the person can see what the AI is holding before
              it places. While aiEditable, cards are also selectable — click
              one, then click an empty opponent slot to place it there,
              exactly mirroring the player's own hand -> slot flow.
              [Dev Test Mode — Phase 2] canEditAiHand cards also get the ✎
              swap-picker, independent of aiEditable's slot-based gate. */}
          <div className={styles['battlefield__opp-hand']} aria-label={`Opponent hand: ${aiHand.length} cards`}>
            {aiHand.map((card, i) => (
              <div
                key={card.id}
                className={styles['battlefield__opp-card-wrap']}
                style={{ ...fanStyle(i, aiHand.length), position: 'relative' }}
              >
                <Card
                  card={card}
                  faceDown={!devMode}
                  selected={aiEditable && selectedAiCardId === card.id}
                  onClick={aiEditable ? () => onAiCardClick?.(card) : undefined}
                />

                {canEditAiHand && (
                  <CardEditButton
                    onClick={() =>
                      setAiEditingCardId((prev) => (prev === card.id ? null : card.id))
                    }
                  />
                )}

                {canEditAiHand && aiEditingCardId === card.id && aiStackCounts && (
                  <CardTypePicker
                    counts={aiStackCounts}
                    onPick={(newType) => {
                      onAiSwapCard!(card.id, newType);
                      setAiEditingCardId(null);
                    }}
                    onClose={() => setAiEditingCardId(null)}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Opponent slots */}
          <div className={clsx(styles.battlefield__row, styles['battlefield__row--ai'])}>
            <span className={styles['battlefield__row-label']}>Opponent</span>
            <div className={styles.battlefield__slots}>
              {SLOT_KEYS.map((key) => {
                const cascadePending = isCascadePending(pendingCascade, 'ai', key);
                const cascadeLaneResolved = hasCascadeLaneResolved(pendingCascade, cascadeFightIndex, 'ai', key);
                const fightGlow = isCurrentCascadeFightSlot(pendingCascade, cascadeFightIndex, 'ai', key);
                const { visuallyFaceDown, showOutcome } = slotVisuals(
                  key,
                  revealStep,
                  !!aiSlots[key].card,
                  !devMode,
                  isDragonRound,
                );
                const aiSlot = aiSlots[key];

                // [Win-First Display Override] While this lane is
                // cascade-pending and not yet individually resolved (and
                // we're not already at the final 'done' catch-all), show
                // the provisional "Win" label instead of aiSlot's true
                // final state (which may already read 'cascaded' — the
                // reducer computes final state up front, see
                // useGameState.ts's Cascade Relabeling sub-block). This is
                // purely a display swap — combat/survivor logic is
                // entirely unaffected, it only changes what badge renders.
                const showFinalCascadeLabel = cascadeLaneResolved || revealStep === 'done';
                const displayAiSlot = cascadePending && !showFinalCascadeLabel
                  ? { ...aiSlot, state: 'won' as const }
                  : aiSlot;

                const aiClickable = aiEditable && (aiSlot.card !== null || selectedAiCardId !== null);
                return (
                  <Slot
                    key={key}
                    slot={displayAiSlot}
                    owner="ai"
                    visuallyFaceDown={visuallyFaceDown}
                    showOutcome={showOutcome}
                    fightGlow={fightGlow}
                    onClick={() => onAiSlotClick?.(key)}
                    clickable={aiClickable}
                    elRef={(el) => registerRef?.(`slot-ai-${key}`, el)}
                  />
                );
              })}
            </div>
          </div>

          {/* Divider */}
          <div className={styles.battlefield__divider} aria-hidden="true">
            <span className={styles['battlefield__divider-label']}>vs</span>
          </div>

          {/* Player slots */}
          <div className={clsx(styles.battlefield__row, styles['battlefield__row--player'])}>
            <div className={styles.battlefield__slots}>
              {SLOT_KEYS.map((key) => {
                const slot = playerSlots[key];
                const cascadePending = isCascadePending(pendingCascade, 'player', key);
                const cascadeLaneResolved = hasCascadeLaneResolved(pendingCascade, cascadeFightIndex, 'player', key);
                const fightGlow = isCurrentCascadeFightSlot(pendingCascade, cascadeFightIndex, 'player', key);
                const { visuallyFaceDown, showOutcome } = slotVisuals(
                  key,
                  revealStep,
                  !!slot.card,
                  false,
                  isDragonRound,
                );

                // [Win-First Display Override] Same swap as the AI loop
                // above, mirrored for the player's own slots.
                const showFinalCascadeLabel = cascadeLaneResolved || revealStep === 'done';
                const displaySlot = cascadePending && !showFinalCascadeLabel
                  ? { ...slot, state: 'won' as const }
                  : slot;

                const clickable = placementActive && (slot.card !== null || selectedCardId !== null);
                return (
                  <Slot
                    key={key}
                    slot={displaySlot}
                    owner="player"
                    visuallyFaceDown={visuallyFaceDown}
                    showOutcome={showOutcome}
                    fightGlow={fightGlow}
                    onClick={() => onSlotClick(key)}
                    clickable={clickable}
                    elRef={(el) => registerRef?.(`slot-player-${key}`, el)}
                  />
                );
              })}
            </div>
            <span className={styles['battlefield__row-label']}>You</span>
          </div>

          {/* [SUB-BLOCK: Dragon Attack overlay] */}
          {showDragonOverlay && (
            <div
              className={clsx(
                styles['dragon-overlay'],
                dragonOverlayOwner === 'player' ? styles['dragon-overlay--player'] : styles['dragon-overlay--ai'],
              )}
              role="status"
            >
              <span className={styles['dragon-overlay__text']}>Dragon Attack</span>
            </div>
          )}

        </div>

        {/* [SUB-BLOCK: Player Discard — right edge, floats toward player's row]
            Stack icon + Shuffle button moved out to PlayerStackControls.tsx,
            rendered next to <Hand> in App.tsx — see the [Layout] note on
            BoardProps. Discard stays here, unchanged.
            [Layout — Battlefield Column Balance Fix] A hidden clone of the
            AI's real StackIcon (same "Opponent" label, so its computed
            width matches the AI column's widest content exactly) is added
            above the Discard pile here — see Board.module.css's
            .stack-col-wrap__ghost doc comment for why: since the player's
            real stack icon lives elsewhere now, this column would
            otherwise only ever hold the narrower Discard pile, leaving
            .battlefield-row's two side columns slightly mismatched in
            footprint even though the row centers via justify-content.
            visibility:hidden keeps it fully invisible and non-interactive
            — it exists purely to occupy the same space. */}
        <div className={clsx(styles['stack-col-wrap'], styles['stack-col-wrap--player'])}>
          <div className={styles['stack-col-wrap__ghost']} aria-hidden="true">
            <StackIcon count={0} label="Opponent" />
          </div>
          <DiscardPile
            count={playerDiscardCount}
            elRef={(el) => registerRef?.('discard-player', el)}
          />
        </div>

      </div>

      {/* [SUB-BLOCK: Dev Test Mode — Phase 1: Stack Inspector panel / Phase 3: editing]
          AI-only now — the player's own inspector lives in
          PlayerStackControls.tsx alongside the moved stack icon. */}
      {devMode && aiInspectorOpen && (
        <StackInspector
          owner="ai"
          stack={aiStack}
          onClose={() => setAiInspectorOpen(false)}
          editable={canEditStacks}
          onSwapCard={onStackSwapCard}
        />
      )}
    </>
  );
}