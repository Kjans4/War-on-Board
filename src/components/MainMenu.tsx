// src/components/MainMenu.tsx

import clsx from 'clsx';
import styles from '../styles/MainMenu.module.css';

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
  return (
    <div className={styles['main-menu']}>
      <h1 className={styles['main-menu__title']}>War on Board</h1>
      <p className={styles['main-menu__subtitle']}>Choose your opponent</p>

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

        {/* [SUB-BLOCK: Dev Test Mode entry — see dev-test-mode-plan.md]
            Phase 1: runs on Random AI underneath, reveals the AI's hand
            face-up. Later phases add stack inspection + hand editing. */}
        <button
          className={clsx(styles['main-menu__btn'], styles['main-menu__btn--dev'])}
          onClick={onSelectDevTest}
        >
          Dev Test
          <span className={styles['main-menu__btn-sub']}>Reveal &amp; configure AI hand</span>
        </button>
      </div>
    </div>
  );
}