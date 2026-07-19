// src/components/MainMenu.tsx

import { useState } from 'react';
import clsx from 'clsx';
import styles from '../styles/MainMenu.module.css';

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
// 'settings' — SFX volume (placeholder, no audio system yet)
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

  // [Settings] Local-only placeholder value — no audio system exists yet,
  // so this never actually plays anything; the slider renders disabled
  // with a "Coming Soon" badge per current design direction. Kept as real
  // state (not a hardcoded number) so the control is ready to wire up the
  // moment SFX lands, without needing to touch this component again.
  const [sfxVolume] = useState(70);

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

        {/* [VIEW: Root] */}
        {view === 'root' && (
          <div className={styles['main-menu__options']}>
            <button
              className={clsx(styles['main-menu__btn'], styles['main-menu__btn--play'])}
              onClick={() => setView('play')}
            >
              Play
              <span className={styles['main-menu__btn-sub']}>Start a match</span>
            </button>

            <button
              className={clsx(styles['main-menu__btn'], styles['main-menu__btn--settings'])}
              onClick={() => setView('settings')}
            >
              Settings
              <span className={styles['main-menu__btn-sub']}>SFX volume</span>
            </button>

            <button
              className={clsx(styles['main-menu__btn'], styles['main-menu__btn--howto'])}
              onClick={() => setView('howto')}
            >
              How to Play
              <span className={styles['main-menu__btn-sub']}>Rules &amp; systems</span>
            </button>

            {/* [SUB-BLOCK: Dev Test Mode entry — see dev-test-mode-plan.md]
                Hidden from the shipped menu per SHOW_DEV_TEST_BUTTON
                above, but left fully wired (prop, handler, markup) for
                internal testing — flip the flag to bring it back. */}
            {SHOW_DEV_TEST_BUTTON && (
              <button
                className={clsx(styles['main-menu__btn'], styles['main-menu__btn--dev'])}
                onClick={onSelectDevTest}
              >
                Dev Test
                <span className={styles['main-menu__btn-sub']}>Reveal &amp; configure AI hand</span>
              </button>
            )}
          </div>
        )}

        {/* [VIEW: Play — Random / Smart mode select] */}
        {view === 'play' && (
          <>
            <div className={styles['main-menu__options']}>
              <button
                className={clsx(styles['main-menu__btn'], styles['main-menu__btn--random'])}
                onClick={onSelectRandom}
              >
                Random
                <span className={styles['main-menu__btn-sub']}>Plays loose, no memory</span>
              </button>

              <button
                className={clsx(
                  styles['main-menu__btn'],
                  styles['main-menu__btn--smart'],
                  styles['main-menu__btn--disabled'],
                )}
                disabled
                aria-disabled="true"
              >
                Smart
                <span className={styles['main-menu__btn-sub']}>Coming soon</span>
              </button>
            </div>

            <button className={styles['main-menu__back']} onClick={handleBack}>
              ← Back
            </button>
          </>
        )}

        {/* [VIEW: Settings — SFX volume placeholder]
            Slider is genuinely disabled (not just styled to look inert) —
            there's no audio system yet, so it must not imply the control
            does anything right now. */}
        {view === 'settings' && (
          <>
            <div className={styles['main-menu__panel']}>
              <div className={styles['main-menu__settings-row']}>
                <div className={styles['main-menu__settings-label-row']}>
                  <span className={styles['main-menu__settings-label']}>SFX Volume</span>
                  <span className={styles['main-menu__coming-soon']}>Coming Soon</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={sfxVolume}
                  disabled
                  readOnly
                  className={styles['main-menu__slider']}
                  aria-label="SFX volume (unavailable — no audio system yet)"
                />
              </div>
            </div>

            <button className={styles['main-menu__back']} onClick={handleBack}>
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

            <button className={styles['main-menu__back']} onClick={handleBack}>
              ← Back
            </button>
          </>
        )}

      </div>
    </div>
  );
}