# War on Board

A 3-slot, simultaneous-reveal strategy card game inspired by *Gwent* (The Witcher 3) — compact, read-heavy, bluff-driven combat between the player and an AI opponent.

---

## Quick Start

```bash
npm install
npm run dev
```

Built with **React + TypeScript** (Vite). No backend — the whole game runs client-side, state managed through a single reducer (`useGameState.ts`).

---

## How to Play

Each round, you and the AI both draw up to a 5-card hand, then secretly place 3 cards — one into each of **Left**, **Center**, and **Right** — face-down. Once both sides have placed, all 3 lanes reveal and resolve simultaneously. Survivors cycle back into your stack to be drawn again later; losers are discarded for good. After 9 rounds, whoever has more cards left (stack + hand combined) wins.

There's no "attack" and "defend" — every lane is a mutual clash. The tension is entirely in **what you commit to each lane, and when**, since you're placing blind against what the opponent is also placing blind.

---

## Core Mechanics

### The RPS Triangle

Three basic card types, each type appearing 7 times per 22-card deck:

- **Sword** beats **Arrow**
- **Arrow** beats **Shield**
- **Shield** beats **Sword**

A lane's basic outcome is just: whichever type wins wins.

### Exhausted Ties

Sometimes both sides play the *same* type into a lane:

| Situation | Result |
|---|---|
| Fresh card vs. fresh card (same type) | Both cards survive, but are now marked **exhausted** |
| Exhausted card vs. fresh card (same type) | The fresh card wins; the exhausted card is discarded |
| Exhausted card vs. exhausted card (same type) | Both cards are discarded ("Spent") |

The exhausted flag persists on a card for as long as it stays in your stack — it doesn't reset between rounds. This means playing the same type repeatedly against a mirrored opponent gets progressively riskier.

### The Dragon

One Dragon card sits in each 22-card deck, outside the RPS triangle entirely. It's single-use — once played, it's gone for the rest of the match, whether it "wins" or not.

- **You play a Dragon, opponent doesn't:** your Dragon's own lane is consumed (a deliberate "wipe," distinct from a loss), and your *other two* lanes automatically win and cycle home — regardless of what's actually in them.
- **Both sides play a Dragon (any lane):** the effects cancel out. Both Dragons are discarded. Any lane where a Dragon faces a non-Dragon card leaves that card untouched. Any lane untouched by either Dragon fights normally.

The Dragon Attack banner only appears for the one-sided case — a mutual cancel is quiet.

### Cascade Combat

After the three lanes resolve their basic RPS/exhausted-tie outcome, whichever cards *won* their own lane (from either side) don't just stand there — they immediately fight each other in a sequential elimination chain, **Left → Center → Right** order:

- The first winner becomes the **champion**, uncontested.
- Each subsequent winner from the **opposing** side challenges the current champion (same rules as a normal lane fight — RPS + exhausted-tie logic).
- Each subsequent winner from the **same** side as the champion doesn't fight — it just queues up as a **reserve**, in case the champion later falls.
- If the champion falls, the challenger becomes the new champion and must immediately fight through any queued reserves from the fallen champion's side, in order.
- A **tie** inside the cascade halts the whole chain immediately — both sides involved in that tie stand as final survivors (marked exhausted, per the usual tie rule), and any reserves that never got to fight simply stand too.

A Dragon round never enters the cascade — the whole round was already decided by the Dragon override above.

### Battle Phases (reveal sequence)

The reveal isn't instant — it plays out in two readable beats:

1. **Phase 1 — The Battle:** all three lanes flip face-up in a Left → Center → Right stagger, then simultaneously resolve. Any lane that's a plain loss, a fresh tie, or a "Spent" (exhausted-vs-exhausted) outcome is now final — its badge pops immediately, and the card flies to the discard pile (or back toward the stack, for a tie). Lanes that *won* their RPS matchup but are heading into a cascade fight stay face-up but dark — their fate isn't decided yet.
2. **Phase 2 — The Cascade:** each cascade fight plays out as its own beat — the two contesting cards glow, the loser's badge pops and it flies to discard, the winner stays dark (it might still be challenged again). If the cascade halts on a tie, nobody flies that beat — both sides simply wait to be revealed once the whole sequence ends.

Once every lane's fate is settled, the round's true survivors cycle home to the stack and the next round begins.

### AI Difficulty

- **Random:** picks from hand and assigns to lanes with no memory or pattern recognition whatsoever.
- **Smart:** tracks two things about your play —
  - **Slot pattern history** — after 2+ rounds, it starts predicting your most frequent type in each specific lane, and counters it.
  - **Card economy** — it tracks how many of each type you've played, and deprioritizes countering a type you're likely running low on.
  - **Confidence curve** — early rounds it plays close to randomly; by round 6+ it commits fairly strongly (85%) to its slot predictions, never quite perfectly.
  - **Shuffling your stack** resets the AI's confidence to zero for one round — a genuine counter-play if you sense it's reading you.

### Round Structure

1. **Draw** — both sides draw up to a 5-card hand.
2. **Placement** — you place 3 cards into your lanes; the AI commits its own 3 cards on a short independent timer (its placement never leaks early — its cards stay face-down regardless of when it commits).
3. **Reveal** — Battle Phases plays out (see above).
4. **Resolution** — history is recorded, survivors cycle to the stack, discards go to the discard pile, and the next round's draw begins.

After **9 rounds**, whoever holds more total cards (stack + hand) wins the match; equal counts is a draw.

---

## Dev Test Mode

A second menu option alongside Random that's meant for testing/debugging, not normal play:

- The AI's hand is revealed face-up.
- You can manually place, remove, or swap the AI's cards, exactly like your own — useful for forcing a specific matchup (e.g. deliberately setting up a multi-fight cascade to test it).
- Both stacks are inspectable (contents, top to bottom) and editable — swap any card's type for another of the same owner's stack, without changing the total card count.
- The Dragon is deliberately excluded from every swap picker — it's a fixed single-copy card, not meant to be duplicated or removed via the dev tools.

---

## Visual Assets

- **Table background:** wood texture, sourced CC0 from [Poly Haven](https://polyhaven.com/textures/wood) / [ambientCG](https://ambientcg.com/).
- **Card art:** realistic-style illustrations for Sword (knight), Arrow (bowman), Shield (heavily armored knight), and Dragon — custom-sourced per card, recommended crop at **2:3 portrait ratio, 600×900px**.

---

## Project Structure

```
src/
  App.tsx                    — top-level game loop, reveal/animation timing, flight orchestration
  main.tsx                   — React entry point
  components/
    Board.tsx                — battlefield layout, per-slot reveal/badge/glow logic
    Card.tsx                 — single card render (type symbol/art, face-down state, exhausted badge)
    CardFlightOverlay.tsx     — ghost-card fly animation between board positions
    CardTypePicker.tsx        — dev-mode type-swap popover (shared by Hand/Board/StackInspector)
    Hand.tsx                  — player's fanned hand row
    HUD.tsx                   — round counter + Play/Skip footer
    MainMenu.tsx              — Random / Smart(disabled) / Dev Test entry screen
    PlayerStackControls.tsx   — player's stack icon + shuffle button
    RoundHistory.tsx          — sidebar log of past rounds' outcomes
    Slot.tsx                  — single battlefield slot (card + outcome badge + cascade glow)
    StackInspector.tsx        — dev-mode read/edit panel for either stack's contents
  logic/
    ai.ts                     — Random/Smart placement strategies, pattern & economy tracking
    combat.ts                 — RPS resolution, Dragon override, cascade combat
    deck.ts                   — deck creation, shuffling, draw-to-fill, stack type counts
  state/
    useGameState.ts           — the single reducer driving all game state
  types/
    game.ts                   — shared types, constants (deck size, round count, etc.)
```

---

## Design Notes

- **Battle Phases is presentation-only.** The reducer resolves the entire round (RPS + cascade) synchronously the instant reveal begins — the phased reveal, glow, and flight animations are purely how that already-decided outcome gets shown to the player over time. No game state changes mid-round; everything mutates at once, at round-end.
- Round count was extended from 7 to 9 rounds per design discussion; the Dragon was added after the original "21-card, no Dragon" concept and is now a core part of the 22-card deck.