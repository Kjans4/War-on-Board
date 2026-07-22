// src/components/MainMenu.tsx

import { useState } from 'react';
import clsx from 'clsx';
import styles from '../styles/MainMenu.module.css';
import { useFullscreen } from '../hooks/useFullscreen';

// [BLOCK: Dev Test Visibility Flag]
// Dev Test Mode's underlying wiring (prop, handler, button markup) stays
// fully intact below — flip this to true to bring the button back for
// internal testing. Kept as a single top-of-file constant rather than
// deleting the code, per explicit design direction: the feature isn't
// gone, just hidden from the shipped menu.
const SHOW_DEV_TEST_BUTTON = false;

// [BLOCK: Menu View State]
// 'root'     — Play / Settings / How to Play (top-level menu)
// 'play'     — Random / Smart mode select
// 'settings' — SFX placeholder (no audio system yet)
// 'howto'    — full rules reference
// All four render in the SAME component/screen — this is a local state
// swap, not a route change, per design direction ("in the same page").
type MenuView = 'root' | 'play' | 'settings' | 'howto';

// [BLOCK: Props]
interface MainMenuProps {
  onSelectRandom: () => void;
  onSelectDevTest: () => void;
  // Smart AI is fully implemented in logic/ai.ts (Phase 3) but not yet
  // wired up as a menu entry point — disabled here intentionally until
  // that's confirmed, per ROADMAP open items.
}

// [BLOCK: Component]
export function MainMenu({ onSelectRandom, onSelectDevTest }: MainMenuProps) {
  const [view, setView] = useState<MenuView>('root');

  // [BLOCK: Mobile Responsiveness — Phase 3: Fullscreen Toggle]
  // Prominent placement per mobile-responsive-plan.md's Phase 3 — a
  // normal-sized stone button alongside Play/Settings/How to Play when
  // the Fullscreen API is available. On iOS Safari (no element
  // Fullscreen API at all, on any current version) this shows a short
  // hint instead of hiding silently — the Main Menu has room for it,
  // unlike the small in-game footer icon (see HUD.tsx's PlayFooter,
  // which hides its own equivalent control entirely instead, since that
  // spot is too tight for explanatory text).
  const { isFullscreen, isSupported: fullscreenSupported, toggleFullscreen } = useFullscreen();

  function handleBack() {
    setView('root');
  }

  return (
    <div className={styles['main-menu']}>

      {/* [SUB-BLOCK: Header — title pinned near the top of the screen,
          per design direction ("adjust the title, put it higher"). The
          subtitle line doubles as a per-view heading so the header still
          reads correctly no matter which sub-view is open below it. */}
      <div className={styles['main-menu__header']}>
        <h1 className={styles['main-menu__title']}>War on Board</h1>
        <p className={styles['main-menu__subtitle']}>
          {view === 'root' && 'Choose an option'}
          {view === 'play' && 'Choose your opponent'}
          {view === 'settings' && 'Settings'}
          {view === 'howto' && 'How to Play'}
        </p>
      </div>

      {/* [SUB-BLOCK: Content — vertically centered in the remaining space
          below the header. Exactly one of the four views below renders
          at a time; switching views is a pure local state swap, so root
          buttons are fully gone (not just hidden) whenever a sub-view is
          open, matching "all the other button will be gone and
          replace[d]". */}
      <div className={styles['main-menu__content']}>

        {/* [VIEW: Root]
            [Carved Stone Buttons] Every button below composes TWO
            classes: .main-menu__stone (the shared background/bevel/glow
            recipe — see MainMenu.module.css) + .main-menu__btn (sizing
            only). Single-line labels, no sub-captions — matches the
            Play/Skip and Shuffle controls' own visual language elsewhere
            in the app. */}
        {view === 'root' && (
          <div className={styles['main-menu__options']}>
            <button
              className={clsx(styles['main-menu__stone'], styles['main-menu__btn'])}
              onClick={() => setView('play')}
            >
              Play
            </button>

            <button
              className={clsx(styles['main-menu__stone'], styles['main-menu__btn'])}
              onClick={() => setView('settings')}
            >
              Settings
            </button>

            <button
              className={clsx(styles['main-menu__stone'], styles['main-menu__btn'])}
              onClick={() => setView('howto')}
            >
              How to Play
            </button>

            {/* [Mobile Responsiveness — Phase 3] Optional feature per the
                plan — additive, no dependency on Phases 1/2 having
                "shipped" any particular way. Reuses the same stone/btn
                classes as the buttons above rather than introducing a
                visually distinct control, so it doesn't compete for
                attention against Play. */}
            {fullscreenSupported && (
              <button
                className={clsx(styles['main-menu__stone'], styles['main-menu__btn'])}
                onClick={toggleFullscreen}
              >
                {isFullscreen ? '⛶ Exit Fullscreen' : '⛶ Fullscreen'}
              </button>
            )}
            {!fullscreenSupported && (
              <p className={styles['main-menu__fullscreen-hint']}>
                Add to Home Screen for a fullscreen-like experience
              </p>
            )}

            {/* [SUB-BLOCK: Dev Test Mode entry — see dev-test-mode-plan.md]
                Hidden from the shipped menu per SHOW_DEV_TEST_BUTTON
                above, but left fully wired (prop, handler, markup) for
                internal testing — flip the flag to bring it back. */}
            {SHOW_DEV_TEST_BUTTON && (
              <button
                className={clsx(styles['main-menu__stone'], styles['main-menu__btn'])}
                onClick={onSelectDevTest}
              >
                Dev Test
              </button>
            )}
          </div>
        )}

        {/* [VIEW: Play — Random / Smart mode select] */}
        {view === 'play' && (
          <>
            <div className={styles['main-menu__options']}>
              <button
                className={clsx(styles['main-menu__stone'], styles['main-menu__btn'])}
                onClick={onSelectRandom}
              >
                Random
              </button>

              <button
                className={clsx(
                  styles['main-menu__stone'],
                  styles['main-menu__btn'],
                  styles['main-menu__btn--disabled'],
                )}
                disabled
                aria-disabled="true"
                title="Coming soon"
              >
                Smart
              </button>
            </div>

            <button
              className={clsx(styles['main-menu__stone'], styles['main-menu__back'])}
              onClick={handleBack}
            >
              ← Back
            </button>
          </>
        )}

        {/* [VIEW: Settings]
            [Paper Panel] No audio system exists yet, so rather than a
            fake, permanently-disabled volume slider implying a control
            that doesn't do anything, this is just a plain status message
            on the same parchment panel How to Play uses — see
            MainMenu.module.css's .main-menu__panel doc comment for the
            paper treatment itself. */}
        {view === 'settings' && (
          <>
            <div className={styles['main-menu__panel']}>
              <p className={styles['main-menu__settings-message']}>
                SFX yet to be added.
              </p>
            </div>

            <button
              className={clsx(styles['main-menu__stone'], styles['main-menu__back'])}
              onClick={handleBack}
            >
              ← Back
            </button>
          </>
        )}

        {/* [VIEW: How to Play — full rules reference]
            Content mirrors war-on-board-gdd.md sections 3–5 (Deck,
            Combat Resolution, Exhausted Ties), reworded for a player
            audience rather than a dev one — no implementation detail,
            just the rules as experienced at the table. Scrollable so it
            never forces the fixed-height app shell to overflow. */}
        {view === 'howto' && (
          <>
            <div className={styles['main-menu__panel']}>
              <div className={styles['main-menu__howto-scroll']}>

                <section className={styles['main-menu__howto-section']}>
                  <h3>Objective</h3>
                  <p>
                    Over 9 rounds, place 3 cards each round into Left, Center, and
                    Right slots against your opponent. Whoever holds the most cards
                    across both stack and hand after round 9 wins.
                  </p>
                </section>

                <section className={styles['main-menu__howto-section']}>
                  <h3>Rock–Paper–Scissors</h3>
                  <p>
                    Sword beats Arrow. Arrow beats Shield. Shield beats Sword. Each
                    slot resolves independently by comparing your card to your
                    opponent's card in that same slot.
                  </p>
                </section>

                <section className={styles['main-menu__howto-section']}>
                  <h3>Exhausted Ties</h3>
                  <p>
                    If both sides play the same type in a slot, neither card is
                    destroyed — both become <strong>exhausted</strong> and return to
                    the stack. An exhausted card loses outright to a fresh card of
                    the same type. Two exhausted cards of the same type tying again
                    are both discarded for good.
                  </p>
                </section>

                <section className={styles['main-menu__howto-section']}>
                  <h3>Cascade Combat</h3>
                  <p>
                    After the three slots resolve, every card that won its slot
                    (from either side) fights on, Left to Right. The first winner
                    stands as champion; each following winner either reinforces
                    its own side or challenges the champion. A losing champion is
                    discarded and replaced by the challenger, who must then fight
                    through anything still queued up. A tie mid-cascade stops the
                    chain — everyone still standing survives the round.
                  </p>
                </section>

                <section className={styles['main-menu__howto-section']}>
                  <h3>The Dragon</h3>
                  <p>
                    One Dragon sits in each deck, outside the Rock–Paper–Scissors
                    triangle. Play it and your other two slots return to your
                    stack untouched while both of your opponent's other cards are
                    destroyed. If both sides play the Dragon in the same round,
                    the effects cancel — both Dragons are discarded and every
                    other slot resolves normally.
                  </p>
                </section>

                <section className={styles['main-menu__howto-section']}>
                  <h3>Stack &amp; Shuffle</h3>
                  <p>
                    Cards that win or tie return to the bottom of your stack and
                    can come back around later in the match. You can shuffle your
                    own stack at any time outside of reveal — useful for breaking
                    up a pattern the opponent might be reading.
                  </p>
                </section>

              </div>
            </div>

            <button
              className={clsx(styles['main-menu__stone'], styles['main-menu__back'])}
              onClick={handleBack}
            >
              ← Back
            </button>
          </>
        )}

      </div>
    </div>
  );
}