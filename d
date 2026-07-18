[33mcommit 55ebfb04bd5395f3b768d7996a869169d84cbb18[m[33m ([m[1;36mHEAD[m[33m -> [m[1;32mmain[m[33m, [m[1;31morigin/main[m[33m)[m
Author: kjans4 <keshierjanpilan@gmail.com>
Date:   Sat Jul 18 10:41:33 2026 +0800

    card reveal status

[1mdiff --git a/src/components/Board.tsx b/src/components/Board.tsx[m
[1mindex f04978a..3fb4486 100644[m
[1m--- a/src/components/Board.tsx[m
[1m+++ b/src/components/Board.tsx[m
[36m@@ -7,7 +7,6 @@[m [mimport type { BoardSlots, SlotKey, Card as CardType, Owner, RPSType, CascadeResu[m
 import { SLOT_KEYS } from '../types/game';[m
 import { Slot } from './Slot';[m
 import { Card } from './Card';[m
[31m-import { CardPile } from './CardPile';[m
 import { StackInspector } from './StackInspector';[m
 import { CardTypePicker, CardEditButton } from './CardTypePicker';[m
 import { getStackTypeCounts } from '../logic/deck';[m
[36m@@ -20,20 +19,29 @@[m [mimport styles from '../styles/Board.module.css';[m
 // left          = left slot revealing[m
 // center        = left + center revealed[m
 // right         = all 3 slots revealed[m
[31m-// phase1Resolve = [Battle Phases] "Phase 1" resolve beat — all 3 lanes are[m
[31m-//   face-up; lost/tied-lost/tied lanes are final and their outcome badges[m
[31m-//   pop here (see slotVisuals). Lanes that won their RPS matchup but are[m
[31m-//   still cascade-pending stay dark until THEIR OWN cascade fight beat[m
[31m-//   resolves (see hasCascadeLaneResolved below), or 'done' if the cascade[m
[31m-//   never eliminates them at all.[m
[32m+[m[32m// phase1Resolve = [Battle Phases] "Phase 1" resolve beat — fires the flight[m
[32m+[m[32m//   animation for lanes that are final and never touched by a cascade[m
[32m+[m[32m//   (lost/tied-lost/tied). Purely a flight-timing marker now — see the[m
[32m+[m[32m//   "Instant Per-Slot Badges" pass below: badges themselves no longer wait[m
[32m+[m[32m//   for this step, they already popped in alongside their slot's own[m
[32m+[m[32m//   left/center/right flip.[m
 // cascadeFight  = [Battle Phases] one beat per cascade.log entry, fired[m
 //   sequentially by App.tsx alongside a matching cascadeFightIndex. The[m
 //   two lanes contesting THAT SPECIFIC beat get a glow accent (see[m
[31m-//   isCurrentCascadeFightSlot), and the beat's loser (per[m
[31m-//   hasCascadeLaneResolved) reveals its badge immediately — the winner[m
[31m-//   stays dark, since it may still be challenged again in a later beat.[m
[31m-// dragonOverlay = all 3 revealed, "Dragon Attack" banner showing (Dragon rounds only)[m
[31m-// done          = all revealed, outcome badges shown, awaiting Next Round[m
[32m+[m[32m//   isCurrentCascadeFightSlot), and the beat's loser's badge flips from its[m
[32m+[m[32m//   provisional "Win" to its true final label ("Cascaded") right here (see[m
[32m+[m[32m//   hasCascadeLaneResolved / the display-override block in the render[m
[32m+[m[32m//   loops below) — the winner keeps showing "Win" provisionally, since it[m
[32m+[m[32m//   may still be challenged again in a later beat.[m
[32m+[m[32m// dragonOverlay = [Instant Dragon Reveal] all 3 revealed, "Dragon Attack"[m
[32m+[m[32m//   banner showing (Dragon rounds only) — outcome badges pop in at this[m
[32m+[m[32m//   SAME beat now (see slotVisuals' isDragonRound branch below), so the[m
[32m+[m[32m//   banner and the win/loss declaration read as one simultaneous moment[m
[32m+[m[32m//   instead of the banner playing over blank cards first.[m
[32m+[m[32m// done          = all revealed, every remaining badge shows (final[m
[32m+[m[32m//   catch-all for any cascade survivor never individually eliminated, and[m
[32m+[m[32m//   for Dragon rounds the badges are already showing by this point —[m
[32m+[m[32m//   'done' just holds them), awaiting Next Round[m
 export type RevealStep =[m
   | null[m
   | 'flipping'[m
[36m@@ -47,9 +55,9 @@[m [mexport type RevealStep =[m
 [m
 // [BLOCK: Cascade Participation Helper][m
 // [Battle Phases] Determines whether a given (owner, slotKey) lane entered[m
[31m-// the cascade fight at all this round — i.e. whether its final outcome[m
[31m-// badge should stay withheld past phase1Resolve instead of popping[m
[31m-// immediately like a plain lost/tied/tied-lost lane.[m
[32m+[m[32m// the cascade fight at all this round — i.e. whether its badge should show[m
[32m+[m[32m// a PROVISIONAL "Win" (see the display-override block in the render loops[m
[32m+[m[32m// below) rather than its true final label the instant its slot reveals.[m
 //[m
 // Deliberately reads ONLY pendingCascade's own overrides/survivingSlots —[m
 // never re-derives lane-winners itself (that would mean re-running[m
[36m@@ -63,7 +71,8 @@[m [mexport type RevealStep =[m
 // Guarded on cascade.triggered: when it's false (0 or 1 lane-winners this[m
 // round, or a Dragon round where cascade never runs at all), there was no[m
 // real fight regardless of what's sitting in survivingSlots — the sole[m
[31m-// winner (if any) is just final in Phase 1, not cascade-pending.[m
[32m+[m[32m// winner (if any) is just final as 'won', not cascade-pending, so it[m
[32m+[m[32m// never needs the provisional-label treatment at all.[m
 function isCascadePending([m
   cascade: CascadeResult | null,[m
   owner: Owner,[m
[36m@@ -77,17 +86,24 @@[m [mfunction isCascadePending([m
 }[m
 [m
 // [BLOCK: Per-Fight Resolution Helper][m
[31m-// [Battle Phases — Phase 3] For a cascade-pending lane, determines whether[m
[31m-// IT SPECIFICALLY has already lost its own cascade fight by the current[m
[31m-// beat (cascadeFightIndex) — i.e. whether its badge should pop now rather[m
[31m-// than waiting for 'done'. Only ever meaningful while stepping through[m
[31m-// cascade.log in order (indices 0..cascadeFightIndex inclusive) — a lane[m
[31m-// that's still winning (or hasn't fought yet) deliberately stays dark[m
[31m-// here even after its own beat, since a persisting champion could still[m
[31m-// fall to a LATER challenger; revealing "Win" prematurely would risk[m
[31m-// having to silently flip it to "Cascaded" afterward, exactly the[m
[31m-// spoiler/two-step problem Battle Phases exists to avoid. Only the[m
[32m+[m[32m// [Battle Phases — Phase 3 / Instant Per-Slot Badges][m
[32m+[m[32m// For a cascade-pending lane, determines whether IT SPECIFICALLY has[m
[32m+[m[32m// already lost its own cascade fight by the current beat[m
[32m+[m[32m// (cascadeFightIndex) — i.e. whether its badge should flip from the[m
[32m+[m[32m// provisional "Win" it's been showing since its slot first revealed, over[m
[32m+[m[32m// to its true final label ("Cascaded"). Only ever meaningful while[m
[32m+[m[32m// stepping through cascade.log in order (indices 0..cascadeFightIndex[m
[32m+[m[32m// inclusive) — a lane that's still winning (or hasn't fought yet)[m
[32m+[m[32m// deliberately keeps showing "Win" here even after its own beat, since a[m
[32m+[m[32m// persisting champion could still fall to a LATER challenger; only the[m
 // eliminated side of a resolved fight is ever reported true.[m
[32m+[m[32m//[m
[32m+[m[32m// [Design note — Win-First Reveal] Per explicit design direction this[m
[32m+[m[32m// session, lanes now show "Win" the instant they're revealed and only[m
[32m+[m[32m// flip to "Cascaded" once they're actually eliminated — the reverse of[m
[32m+[m[32m// the previous no-spoiler policy (which withheld the badge entirely until[m
[32m+[m[32m// a lane's fate was fully known). See the display-override block in the[m
[32m+[m[32m// render loops below for where the provisional label is applied.[m
 function hasCascadeLaneResolved([m
   cascade: CascadeResult | null,[m
   cascadeFightIndex: number | null,[m
[36m@@ -106,7 +122,9 @@[m [mfunction hasCascadeLaneResolved([m
     if (entry.outcome === 'challengerWon' && championKey === target) return true;[m
     if (entry.outcome === 'tiedLost' && (championKey === target || challengerKey === target)) return true;[m
     // plain 'tied' eliminates neither side — both withdraw as survivors,[m
[31m-    // so it never marks either lane "resolved" here; they wait for 'done'.[m
[32m+[m[32m    // so it never marks either lane "resolved" here; they keep showing[m
[32m+[m[32m    // "Win" until 'done' reconciles them (harmlessly — they finish as[m
[32m+[m[32m    // 'won' anyway, never overridden).[m
   }[m
 [m
   return false;[m
[36m@@ -135,37 +153,45 @@[m [mfunction isCurrentCascadeFightSlot([m
   );[m
 }[m
 [m
[31m-// [BLOCK: Per-slot visual state][m
[32m+[m[32m// [BLOCK: Per-slot visual state — Instant Per-Slot Badges][m
 // Given the current reveal step, returns whether each slot should be shown[m
 // face-down and whether its outcome badge/glow should be visible.[m
[31m-// This decouples "what the game state says" from "what's currently on screen"[m
[31m-// so the staggered reveal can show each slot individually while the reducer[m
[31m-// already has the final outcome for all three.[m
 //[m
[31m-// [Battle Phases] Badge timing, current rules:[m
[31m-//   - flipping/left/center/right: cards flip face-up per the existing[m
[31m-//     stagger, but NO badges yet regardless of lane —"all 3 cards battle"[m
[31m-//     reads as one simultaneous beat rather than a trickle.[m
[31m-//   - phase1Resolve / cascadeFight: non-cascade-pending lanes (lost,[m
[31m-//     tied, tied-lost, or the sole winner of a no-cascade round) show[m
[31m-//     their badge immediately. Cascade-pending lanes show their badge the[m
[31m-//     moment cascadeLaneResolved is true for them (their own fight just[m
[31m-//     eliminated them — see hasCascadeLaneResolved) and stay dark[m
[31m-//     otherwise, including for a still-winning champion awaiting a later[m
[31m-//     challenger.[m
[31m-//   - dragonOverlay: no badges — the banner plays over face-up cards,[m
[31m-//     badges wait for 'done' (Dragon rounds never set cascadePending[m
[31m-//     true, so this branch is unaffected by cascade logic entirely).[m
[31m-//   - done: every lane's badge shows, unconditionally — the final[m
[31m-//     catch-all for any cascade survivor that was never individually[m
[31m-//     eliminated.[m
[32m+[m[32m// [Design note — this session] Previously badges were withheld until[m
[32m+[m[32m// phase1Resolve/cascadeFight/done regardless of how far the card-flip[m
[32m+[m[32m// stagger had progressed — "all 3 cards battle" read as one simultaneous[m
[32m+[m[32m// beat, then results trickled in afterward. Per explicit design direction[m
[32m+[m[32m// this session, that's reversed for non-Dragon rounds: a slot's badge now[m
[32m+[m[32m// rides along with THAT SLOT'S OWN flip — Left shows its win/loss the[m
[32m+[m[32m// instant Left flips face-up, without waiting for Center/Right. Dragon[m
[32m+[m[32m// rounds are the one exception (see the isDragonRound branch below) — the[m
[32m+[m[32m// banner and every badge still appear together, at the dragonOverlay beat,[m
[32m+[m[32m// rather than each slot popping independently.[m
[32m+[m[32m//[m
[32m+[m[32m// Non-Dragon rules now:[m
[32m+[m[32m//   - flipping: nothing revealed yet, no badges.[m
[32m+[m[32m//   - left/center/right: cards flip face-up per the existing stagger, and[m
[32m+[m[32m//     each slot's badge appears the moment THAT slot flips. A cascade-[m
[32m+[m[32m//     pending lane's badge is a PROVISIONAL "Win" at this point — see the[m
[32m+[m[32m//     display-override block in the render loops below, which is what[m
[32m+[m[32m//     actually swaps the label to "Cascaded" once that lane is eliminated.[m
[32m+[m[32m//   - phase1Resolve/cascadeFight/done: all 3 already revealed by 'right',[m
[32m+[m[32m//     so these later steps are just "still revealed" — no visual change[m
[32m+[m[32m//     from this function's point of view (cascade label swaps happen via[m
[32m+[m[32m//     the display-override block, not here).[m
[32m+[m[32m//[m
[32m+[m[32m// Dragon rounds:[m
[32m+[m[32m//   - flipping/left/center/right: cards flip per buildDragonTimeline's[m
[32m+[m[32m//     jump-ahead schedule, no badges yet.[m
[32m+[m[32m//   - dragonOverlay/done: fully revealed AND badges shown — banner and[m
[32m+[m[32m//     win/loss declaration land together at dragonOverlay, done just[m
[32m+[m[32m//     holds that same state.[m
 function slotVisuals([m
   slotKey: SlotKey,[m
   revealStep: RevealStep,[m
   hasCard: boolean,[m
   hideDuringPlacement: boolean,[m
[31m-  cascadePending: boolean,[m
[31m-  cascadeLaneResolved: boolean,[m
[32m+[m[32m  isDragonRound: boolean,[m
 ): { visuallyFaceDown: boolean; showOutcome: boolean } {[m
   if (revealStep === null) {[m
     // Pre-reveal — either mid-placement, or the brief gap between rounds.[m
[36m@@ -184,36 +210,43 @@[m [mfunction slotVisuals([m
     return { visuallyFaceDown: false, showOutcome: false };[m
   }[m
 [m
[31m-  if (revealStep === 'done') {[m
[31m-    return { visuallyFaceDown: false, showOutcome: true };[m
[31m-  }[m
[31m-[m
[31m-  if (revealStep === 'dragonOverlay') {[m
[31m-    return { visuallyFaceDown: false, showOutcome: false };[m
[31m-  }[m
[32m+[m[32m  const ORDER: SlotKey[] = ['left', 'center', 'right'];[m
[32m+[m[32m  const slotIndex = ORDER.indexOf(slotKey);[m
 [m
[31m-  if (revealStep === 'phase1Resolve' || revealStep === 'cascadeFight') {[m
[31m-    const revealed = !cascadePending || cascadeLaneResolved;[m
[31m-    return { visuallyFaceDown: false, showOutcome: revealed };[m
[32m+[m[32m  if (isDragonRound) {[m
[32m+[m[32m    // Banner + every badge land together at dragonOverlay; done just[m
[32m+[m[32m    // holds that same revealed/shown state.[m
[32m+[m[32m    if (revealStep === 'dragonOverlay' || revealStep === 'done') {[m
[32m+[m[32m      return { visuallyFaceDown: false, showOutcome: true };[m
[32m+[m[32m    }[m
[32m+[m
[32m+[m[32m    // flipping/left/center/right — card-flip stagger only, per[m
[32m+[m[32m    // buildDragonTimeline's jump-ahead schedule. No badges yet.[m
[32m+[m[32m    const stepIndex: Record<string, number> = { flipping: -1, left: 0, center: 1, right: 2 };[m
[32m+[m[32m    const revealedUpTo = stepIndex[revealStep] ?? -1;[m
[32m+[m[32m    const revealed = slotIndex <= revealedUpTo;[m
[32m+[m[32m    return { visuallyFaceDown: !revealed, showOutcome: false };[m
   }[m
 [m
[31m-  // flipping / left / center / right — card-flip stagger only. Badges[m
[31m-  // never show here anymore; they wait for phase1Resolve at the earliest.[m
[31m-  const ORDER: SlotKey[] = ['left', 'center', 'right'];[m
[32m+[m[32m  // Non-Dragon — badge rides along with this slot's own flip. Every step[m
[32m+[m[32m  // from 'left' onward (including phase1Resolve/cascadeFight/done, which[m
[32m+[m[32m  // all occur after 'right') counts as "fully staggered past", so default[m
[32m+[m[32m  // any of those later-named steps to fully revealed.[m
   const stepIndex: Record<string, number> = {[m
[31m-    flipping: -1, // nothing revealed yet[m
[32m+[m[32m    flipping: -1,[m
     left: 0,[m
     center: 1,[m
     right: 2,[m
[32m+[m[32m    phase1Resolve: 2,[m
[32m+[m[32m    cascadeFight: 2,[m
[32m+[m[32m    done: 2,[m
   };[m
[31m-[m
[31m-  const revealedUpTo = stepIndex[revealStep] ?? -1;[m
[31m-  const slotIndex = ORDER.indexOf(slotKey);[m
[32m+[m[32m  const revealedUpTo = stepIndex[revealStep] ?? 2;[m
   const revealed = slotIndex <= revealedUpTo;[m
 [m
   return {[m
     visuallyFaceDown: !revealed,[m
[31m-    showOutcome: false,[m
[32m+[m[32m    showOutcome: revealed,[m
   };[m
 }[m
 [m
[36m@@ -241,7 +274,7 @@[m [minterface BoardProps {[m
   // outside devMode, same convention as onAiCardClick/onAiSlotClick above.[m
   onAiSwapCard?: (cardId: string, newType: RPSType) => void;[m
   // [Layout] playerStackCount/onShuffleStack/canShuffle/playerStack removed[m
[31m-  // from Board's props — the player's stack pile + shuffle button now[m
[32m+[m[32m  // from Board's props — the player's stack icon + shuffle button now[m
   // render next to <Hand> in App.tsx instead of inside the battlefield row[m
   // (see the new PlayerStackControls.tsx). The player's Discard pile stays[m
   // here, unchanged.[m
[36m@@ -270,7 +303,7 @@[m [minterface BoardProps {[m
   // hand row.[m
   devMode?: boolean;[m
   // [Dev Test Mode — Phase 1: Stack Inspector / Phase 2: Hand Swap][m
[31m-  // The AI's own stack contents — used by devMode's AI stack-pile click[m
[32m+[m[32m  // The AI's own stack contents — used by devMode's AI stack-icon click[m
   // (read-only inspector) AND as the source of per-type remaining counts[m
   // for the AI hand swap-picker (getStackTypeCounts(aiStack)). The[m
   // player's stack no longer passes through Board at all (see above) — the[m
[36m@@ -289,7 +322,7 @@[m [minterface BoardProps {[m
   // ever opens the AI's own inspector now, so App.tsx fixes owner: 'ai' at[m
   // the call site.[m
   onStackSwapCard?: (cardId: string, newType: RPSType) => void;[m
[31m-  // Exposes DOM nodes for stack piles, discard piles, and slots up to[m
[32m+[m[32m  // Exposes DOM nodes for stack icons, discard piles, and slots up to[m
   // App.tsx by key (e.g. 'stack-player', 'discard-ai', 'slot-player-left')[m
   // so the return-flight animation can measure flight source/destination[m
   // rects. Purely a measurement hook — no visual effect on its own.[m
[36m@@ -309,6 +342,62 @@[m [mfunction fanStyle(index: number, total: number): CSSProperties {[m
   };[m
 }[m
 [m
[32m+[m[32m// [BLOCK: Stack Icon][m
[32m+[m[32m// [Dev Test Mode — Phase 1] onClick/clickable let App/Board open the Stack[m
[32m+[m[32m// Inspector panel — only ever wired to be clickable when devMode is on[m
[32m+[m[32m// (see Board's render below). Normal play never sets these, so the icon[m
[32m+[m[32m// stays purely decorative/count-display outside dev mode, unchanged from[m
[32m+[m[32m// before this phase.[m
[32m+[m[32mfunction StackIcon({[m
[32m+[m[32m  count,[m
[32m+[m[32m  label,[m
[32m+[m[32m  elRef,[m
[32m+[m[32m  onClick,[m
[32m+[m[32m  clickable = false,[m
[32m+[m[32m}: {[m
[32m+[m[32m  count: number;[m
[32m+[m[32m  label: string;[m
[32m+[m[32m  elRef?: (el: HTMLDivElement | null) => void;[m
[32m+[m[32m  onClick?: () => void;[m
[32m+[m[32m  clickable?: boolean;[m
[32m+[m[32m}) {[m
[32m+[m[32m  return ([m
[32m+[m[32m    <div[m
[32m+[m[32m      className={clsx(styles['stack-col'], clickable && styles['stack-col--clickable'])}[m
[32m+[m[32m      ref={elRef}[m
[32m+[m[32m      onClick={clickable ? onClick : undefined}[m
[32m+[m[32m      role={clickable ? 'button' : undefined}[m
[32m+[m[32m      tabIndex={clickable ? 0 : undefined}[m
[32m+[m[32m      onKeyDown={clickable ? (e) => e.key === 'Enter' && onClick?.() : undefined}[m
[32m+[m[32m      title={clickable ? `Inspect ${label.toLowerCase()} stack` : undefined}[m
[32m+[m[32m    >[m
[32m+[m[32m      <span className={styles['stack-col__count']}>{count}</span>[m
[32m+[m[32m      <div className={styles['stack-col__icon']} aria-hidden="true" />[m
[32m+[m[32m      <span className={styles['stack-col__label']}>{label}</span>[m
[32m+[m[32m    </div>[m
[32m+[m[32m  );[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m// [BLOCK: Discard Pile][m
[32m+[m[32m// Visual home for cards that didn't survive the round — purely a display[m
[32m+[m[32m// of GameState.playerDiscard/aiDiscard's length, plus a landing point for[m
[32m+[m[32m// the return-flight animation (see App.tsx's buildReturnFlights).[m
[32m+[m[32mfunction DiscardPile({[m
[32m+[m[32m  count,[m
[32m+[m[32m  elRef,[m
[32m+[m[32m}: {[m
[32m+[m[32m  count: number;[m
[32m+[m[32m  elRef?: (el: HTMLDivElement | null) => void;[m
[32m+[m[32m}) {[m
[32m+[m[32m  return ([m
[32m+[m[32m    <div className={styles['discard-col']} ref={elRef}>[m
[32m+[m[32m      <span className={styles['discard-col__count']}>{count}</span>[m
[32m+[m[32m      <div className={styles['discard-col__icon']} aria-hidden="true" />[m
[32m+[m[32m      <span className={styles['discard-col__label']}>Discard</span>[m
[32m+[m[32m    </div>[m
[32m+[m[32m  );[m
[32m+[m[32m}[m
[32m+[m
 // [BLOCK: Component][m
 export function Board({[m
   playerSlots,[m
[36m@@ -360,10 +449,17 @@[m [mexport function Board({[m
   const canEditAiHand = devMode && placementActive && !!onAiSwapCard;[m
   const aiStackCounts = canEditAiHand ? getStackTypeCounts(aiStack) : null;[m
 [m
[32m+[m[32m  // [Instant Dragon Reveal] Whether this round is a Dragon round at all —[m
[32m+[m[32m  // drives slotVisuals' isDragonRound branch (badges wait for[m
[32m+[m[32m  // dragonOverlay instead of riding each slot's own flip). Reusing the[m
[32m+[m[32m  // same dragonOverlayOwner prop the banner itself keys off, so the two[m
[32m+[m[32m  // are guaranteed to agree — never derived separately.[m
[32m+[m[32m  const isDragonRound = dragonOverlayOwner !== null;[m
[32m+[m
   // Overlay shows from the moment the timeline reaches 'dragonOverlay' and[m
[31m-  // lingers through 'done' (so it's still visible while outcome badges pop[m
[31m-  // in), then disappears once the round transitions and the caller resets[m
[31m-  // dragonOverlayOwner to null.[m
[32m+[m[32m  // lingers through 'done' (so it's still visible while outcome badges[m
[32m+[m[32m  // hold), then disappears once the round transitions and the caller[m
[32m+[m[32m  // resets dragonOverlayOwner to null.[m
   const showDragonOverlay =[m
     dragonOverlayOwner !== null && (revealStep === 'dragonOverlay' || revealStep === 'done');[m
 [m
[36m@@ -378,26 +474,17 @@[m [mexport function Board({[m
     <>[m
       <div className={styles['battlefield-row']}>[m
 [m
[31m-        {/* [SUB-BLOCK: Opponent Stack + Discard — left edge, floats toward opponent's row][m
[31m-            [Card Art] Both piles now render via the shared <CardPile>[m
[31m-            component — real 72x108 face-down cards with a depth-stack[m
[31m-            effect, rather than the old decorative icon boxes. See[m
[31m-            CardPile.tsx / Board.module.css's .card-pile block. */}[m
[32m+[m[32m        {/* [SUB-BLOCK: Opponent Stack + Discard — left edge, floats toward opponent's row] */}[m
         <div className={clsx(styles['stack-col-wrap'], styles['stack-col-wrap--ai'])}>[m
[31m-          <CardPile[m
[32m+[m[32m          <StackIcon[m
             count={aiStackCount}[m
             label="Opponent"[m
[31m-            variant="stack"[m
[31m-            showLabel={false}[m
             elRef={(el) => registerRef?.('stack-ai', el)}[m
             onClick={handleAiStackClick}[m
             clickable={devMode}[m
[31m-            title="Inspect opponent stack"[m
           />[m
[31m-          <CardPile[m
[32m+[m[32m          <DiscardPile[m
             count={aiDiscardCount}[m
[31m-            label="Discard"[m
[31m-            variant="discard"[m
             elRef={(el) => registerRef?.('discard-ai', el)}[m
           />[m
         </div>[m
[36m@@ -461,15 +548,29 @@[m [mexport function Board({[m
                   revealStep,[m
                   !!aiSlots[key].card,[m
                   !devMode,[m
[31m-                  cascadePending,[m
[31m-                  cascadeLaneResolved,[m
[32m+[m[32m                  isDragonRound,[m
                 );[m
                 const aiSlot = aiSlots[key];[m
[32m+[m
[32m+[m[32m                // [Win-First Display Override] While this lane is[m
[32m+[m[32m                // cascade-pending and not yet individually resolved (and[m
[32m+[m[32m                // we're not already at the final 'done' catch-all), show[m
[32m+[m[32m                // the provisional "Win" label instead of aiSlot's true[m
[32m+[m[32m                // final state (which may already read 'cascaded' — the[m
[32m+[m[32m                // reducer computes final state up front, see[m
[32m+[m[32m                // useGameState.ts's Cascade Relabeling sub-block). This is[m
[32m+[m[32m                // purely a display swap — combat/survivor logic is[m
[32m+[m[32m                // entirely unaffected, it only changes what badge renders.[m
[32m+[m[32m                const showFinalCascadeLabel = cascadeLaneResolved || revealStep === 'done';[m
[32m+[m[32m                const displayAiSlot = cascadePending && !showFinalCascadeLabel[m
[32m+[m[32m                  ? { ...aiSlot, state: 'won' as const }[m
[32m+[m[32m                  : aiSlot;[m
[32m+[m
                 const aiClickable = aiEditable && (aiSlot.card !== null || selectedAiCardId !== null);[m
                 return ([m
                   <Slot[m
                     key={key}[m
[31m-                    slot={aiSlot}[m
[32m+[m[32m                    slot={displayAiSlot}[m
                     owner="ai"[m
                     visuallyFaceDown={visuallyFaceDown}[m
                     showOutcome={showOutcome}[m
[36m@@ -501,14 +602,21 @@[m [mexport function Board({[m
                   revealStep,[m
                   !!slot.card,[m
                   false,[m
[31m-                  cascadePending,[m
[31m-                  cascadeLaneResolved,[m
[32m+[m[32m                  isDragonRound,[m
                 );[m
[32m+[m
[32m+[m[32m                // [Win-First Display Override] Same swap as the AI loop[m
[32m+[m[32m                // above, mirrored for the player's own slots.[m
[32m+[m[32m                const showFinalCascadeLabel = cascadeLaneResolved || revealStep === 'done';[m
[32m+[m[32m                const displaySlot = cascadePending && !showFinalCascadeLabel[m
[32m+[m[32m                  ? { ...slot, state: 'won' as const }[m
[32m+[m[32m                  : slot;[m
[32m+[m
                 const clickable = placementActive && (slot.card !== null || selectedCardId !== null);[m
                 return ([m
                   <Slot[m
                     key={key}[m
[31m-                    slot={slot}[m
[32m+[m[32m                    slot={displaySlot}[m
                     owner="player"[m
                     visuallyFaceDown={visuallyFaceDown}[m
                     showOutcome={showOutcome}[m
[36m@@ -539,29 +647,26 @@[m [mexport function Board({[m
         </div>[m
 [m
         {/* [SUB-BLOCK: Player Discard — right edge, floats toward player's row][m
[31m-            Stack pile + Shuffle button moved out to PlayerStackControls.tsx,[m
[32m+[m[32m            Stack icon + Shuffle button moved out to PlayerStackControls.tsx,[m
             rendered next to <Hand> in App.tsx — see the [Layout] note on[m
             BoardProps. Discard stays here, unchanged.[m
             [Layout — Battlefield Column Balance Fix] A hidden clone of the[m
[31m-            AI's real card pile (same "Opponent" label, rendered at full[m
[31m-            depth-stack count so its footprint matches the AI column's[m
[31m-            widest/tallest possible state) is added above the Discard pile[m
[31m-            here — see Board.module.css's .stack-col-wrap__ghost doc[m
[31m-            comment for why: since the player's real stack pile lives[m
[31m-            elsewhere now, this column would otherwise only ever hold the[m
[31m-            Discard pile, leaving .battlefield-row's two side columns[m
[31m-            slightly mismatched in footprint even though the row centers[m
[31m-            via justify-content. visibility:hidden keeps it fully invisible[m
[31m-            and non-interactive — it exists purely to occupy the same[m
[31m-            space. */}[m
[32m+[m[32m            AI's real StackIcon (same "Opponent" label, so its computed[m
[32m+[m[32m            width matches the AI column's widest content exactly) is added[m
[32m+[m[32m            above the Discard pile here — see Board.module.css's[m
[32m+[m[32m            .stack-col-wrap__ghost doc comment for why: since the player's[m
[32m+[m[32m            real stack icon lives elsewhere now, this column would[m
[32m+[m[32m            otherwise only ever hold the narrower Discard pile, leaving[m
[32m+[m[32m            .battlefield-row's two side columns slightly mismatched in[m
[32m+[m[32m            footprint even though the row centers via justify-content.[m
[32m+[m[32m            visibility:hidden keeps it fully invisible and non-interactive[m
[32m+[m[32m            — it exists purely to occupy the same space. */}[m
         <div className={clsx(styles['stack-col-wrap'], styles['stack-col-wrap--player'])}>[m
           <div className={styles['stack-col-wrap__ghost']} aria-hidden="true">[m
[31m-            <CardPile count={3} label="Opponent" variant="stack" showLabel={false} />[m
[32m+[m[32m            <StackIcon count={0} label="Opponent" />[m
           </div>[m
[31m-          <CardPile[m
[32m+[m[32m          <DiscardPile[m
             count={playerDiscardCount}[m
[31m-            label="Discard"[m
[31m-            variant="discard"[m
             elRef={(el) => registerRef?.('discard-player', el)}[m
           />[m
         </div>[m
[36m@@ -570,7 +675,7 @@[m [mexport function Board({[m
 [m
       {/* [SUB-BLOCK: Dev Test Mode — Phase 1: Stack Inspector panel / Phase 3: editing][m
           AI-only now — the player's own inspector lives in[m
[31m-          PlayerStackControls.tsx alongside the moved stack pile. */}[m
[32m+[m[32m          PlayerStackControls.tsx alongside the moved stack icon. */}[m
       {devMode && aiInspectorOpen && ([m
         <StackInspector[m
           owner="ai"[m
