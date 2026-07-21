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

Each round, you and the AI both draw up to a 5-card hand, then secretly place cards — one into each of **Left**, **Center**, and **Right** — face-down. Once both sides have placed, all 3 lanes reveal and resolve simultaneously. Survivors cycle back onto the **top** of your stack — they're the very next card you draw, not something that resurfaces several rounds later. Losers are discarded for good. After 9 rounds, whoever has more cards left (stack + hand combined) wins.

There's no "attack" and "defend" — every lane is a mutual clash. The tension is entirely in **what you commit to each lane, and when**, since you're placing blind against what the opponent is also placing blind.

Normally that's 3 cards a round, but if your stack runs completely dry and your hand can't reach 3 either, you place however many you actually have — each side is capped independently by its own card count, so a scarce opponent doesn't force you to also play short, and vice versa. Any lane you can't fill just hands the opposing card there an automatic, uncontested win.

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

- **You play a Dragon, opponent doesn't:** your Dragon's own lane is consumed (a deliberate "wipe," distinct from a loss), and your *other two* lanes automatically win and cycle home — regardless of what's actually in them. The wipe itself is a whole-board effect: even if you didn't have a card of your own in one of those other lanes (e.g. you were short on cards that round), the opponent's card there is still destroyed.
- **Both sides play a Dragon (any lane):** the effects cancel out. Both Dragons are discarded. Any lane where a Dragon faces a non-Dragon card leaves that card untouched. Any lane untouched by either Dragon fights normally.

The Dragon Attack banner only appears for the one-sided case — a mutual cancel is quiet.

### Cascade Combat

After the three lanes resolve their basic RPS/exhausted-tie outcome, whichever cards *won* their own lane (from either side) don't just stand there — they immediately fight each other in a sequential elimination chain, **Left → Center → Right** order:

- The first winner becomes the **champion**, uncontested.
- Each subsequent winner from the **opposing** side challenges the current champion (same rules as a normal lane fight — RPS + exhausted-tie logic).
- Each subsequent winner from the **same** side as the champion doesn't fight — it just queues up as a **reserve**, in case the champion later falls.
- If the champion falls, the challenger becomes the new champion and must immediately fight through any queued reserves from the fallen champion's side, in order.
- A **tie** inside the cascade halts the whole chain immediately — both sides involved in that tie stand as final survivors (marked exhausted, per the usual tie rule), and any reserves that never got to fight simply stand too.

An uncontested win (see "How to Play," above — a lane where the opponent simply had no card to place) enters the cascade exactly like any other win; there's no mechanical difference between winning a fight and winning by default.

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

Not yet exposed in the shipped Main Menu (see "Main Menu," below) — the logic is fully implemented and playable by wiring `SET_DIFFICULTY` / selecting it in code, pending confirmation it's ready to ship.

### Round Structure

1. **Draw** — both sides draw up to a 5-card hand.
2. **Placement** — you place your cards into your lanes (normally 3, fewer if you're short on cards — see "How to Play," above); the AI commits its own cards on a short independent timer (its placement never leaks early — its cards stay face-down regardless of when it commits).
3. **Reveal** — Battle Phases plays out (see above).
4. **Resolution** — history is recorded, survivors cycle to the top of the stack, discards go to the discard pile, and the next round's draw begins.

After **9 rounds**, whoever holds more total cards (stack + hand) wins the match; equal counts is a draw.

**Shuffle** has real strategic weight because of the top-of-stack return above: leave your stack alone and whatever won or tied this round comes right back as your very next draw — fully predictable, for better or worse. Shuffling scrambles that order, at the cost of also resetting Smart AI's own confidence for one round.

---

## Main Menu

The Main Menu is a single screen that swaps between a few local views rather than separate pages:

- **Play** → choose **Random** or **Smart** (Smart currently disabled, "Coming soon")
- **Settings** → a placeholder for SFX volume; no audio system exists yet, so this is currently just an honest "SFX yet to be added" message rather than a fake working control
- **How to Play** → an in-app rules reference (Objective, RPS Triangle, Exhausted Ties, Cascade Combat, the Dragon, Stack & Shuffle), styled as a parchment page
- **← Back** returns to the root menu from any of the above

Buttons are styled as carved stone — dark, engraved-looking text at rest, glowing gold on hover. The in-game Play/Skip button (in the HUD sidebar) is the one exception: since it signals this round's primary action, it stays always-lit (gold for Play, red for Skip) rather than requiring a hover to reveal itself.

**Dev Test Mode** (see below) currently has no menu entry — it's hidden behind a single constant (`SHOW_DEV_TEST_BUTTON` in `MainMenu.tsx`) rather than removed; flip it to `true` to bring the button back for internal testing.

---

## Dev Test Mode

A hidden testing/debugging mode — not currently reachable from the shipped Main Menu (see above), but fully implemented and just a flag flip away:

- The AI's hand is revealed face-up.
- You can manually place, remove, or swap the AI's cards, exactly like your own — useful for forcing a specific matchup (e.g. deliberately setting up a multi-fight cascade to test it).
- Both stacks are inspectable (contents, top to bottom) and editable — swap any card's type for another of the same owner's stack, without changing the total card count.
- The Dragon is deliberately excluded from every swap picker — it's a fixed single-copy card, not meant to be duplicated or removed via the dev tools.

---

## Visual Assets

- **Table background:** wood texture, sourced CC0 from [Poly Haven](https://polyhaven.com/textures/wood) / [ambientCG](https://ambientcg.com/).
- **Menu art:** a battle-scene illustration (`menu.jpg`) used full-bleed behind the Main Menu, and reused a second time on the game screen itself — the board frame now hugs its own content rather than stretching edge-to-edge, so the same artwork bleeds through on both sides, each cropped independently to frame a figure rather than sharing one central crop.
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
    MainMenu.tsx              — Play (→ Random/Smart) / Settings / How to Play menu; Dev Test entry
                                 present in code but hidden behind a flag (see "Main Menu," above)
    PlayerStackControls.tsx   — player's stack icon + shuffle button
    RoundHistory.tsx          — sidebar log of past rounds' outcomes
    Slot.tsx                  — single battlefield slot (card + outcome badge + cascade glow)
    StackInspector.tsx        — dev-mode read/edit panel for either stack's contents
  logic/
    ai.ts                     — Random/Smart placement strategies, pattern & economy tracking
    combat.ts                 — RPS resolution, Dragon override, cascade combat, card-scarcity handling
    deck.ts                   — deck creation, shuffling, draw-to-fill, stack type counts
  state/
    useGameState.ts           — the single reducer driving all game state
  types/
    game.ts                   — shared types, constants (deck size, round count, placement-cap helper)
```

---

## Design Notes

- **Battle Phases is presentation-only.** The reducer resolves the entire round (RPS + cascade) synchronously the instant reveal begins — the phased reveal, glow, and flight animations are purely how that already-decided outcome gets shown to the player over time. No game state changes mid-round; everything mutates at once, at round-end.
- Round count was extended from 7 to 9 rounds per design discussion; the Dragon was added after the original "21-card, no Dragon" concept and is now a core part of the 22-card deck.
- **Card scarcity is handled without a shared/forced cap.** Each side's placement target for a round is `min(3, own hand + already placed)`, computed independently — a scarce player never forces the AI to also place fewer, and vice versa. A slot left empty by one side just becomes an automatic, cascade-eligible win for whichever side still has a card there.
- **Survivors return to the top of the stack, not the bottom.** This was a deliberate reversal — it makes Shuffle a genuine strategic choice (scramble a predictable next draw) rather than a niche Smart-AI counter-tech, which is the only thing it did before.