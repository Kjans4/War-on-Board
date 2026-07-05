// src/components/MainMenu.tsx

import clsx from 'clsx';

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
    <div className="main-menu">
      <h1 className="main-menu__title">War on Board</h1>
      <p className="main-menu__subtitle">Choose your opponent</p>

      <div className="main-menu__options">
        <button
          className="main-menu__btn main-menu__btn--random"
          onClick={onSelectRandom}
        >
          Random
          <span className="main-menu__btn-sub">Plays loose, no memory</span>
        </button>

        <button
          className={clsx('main-menu__btn', 'main-menu__btn--smart', 'main-menu__btn--disabled')}
          disabled
          aria-disabled="true"
        >
          Smart
          <span className="main-menu__btn-sub">Coming soon</span>
        </button>

        {/* [SUB-BLOCK: Dev Test Mode entry — see dev-test-mode-plan.md]
            Phase 1: runs on Random AI underneath, reveals the AI's hand
            face-up. Later phases add stack inspection + hand editing. */}
        <button
          className="main-menu__btn main-menu__btn--dev"
          onClick={onSelectDevTest}
        >
          Dev Test
          <span className="main-menu__btn-sub">Reveal &amp; configure AI hand</span>
        </button>
      </div>
    </div>
  );
}

// [BLOCK: Styles]
export const mainMenuStyles = `
  .main-menu {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 100%;
    width: 100%;
    text-align: center;
  }

  .main-menu__title {
    font-size: 40px;
    font-weight: 700;
    color: #eee;
    margin: 0;
    letter-spacing: -0.5px;
  }

  .main-menu__subtitle {
    font-size: 14px;
    color: #777;
    margin: 0 0 28px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .main-menu__options {
    display: flex;
    gap: 16px;
  }

  .main-menu__btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    width: 180px;
    padding: 20px 16px;
    border-radius: 12px;
    border: 2px solid #333;
    background: #0d0d1a;
    color: #ddd;
    font-size: 18px;
    font-weight: 700;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s, transform 0.15s;
  }

  .main-menu__btn:hover:not(:disabled) {
    border-color: #f0c040;
    background: rgba(240,192,64,0.06);
    transform: translateY(-2px);
  }

  .main-menu__btn--disabled,
  .main-menu__btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .main-menu__btn--dev:hover:not(:disabled) {
    border-color: #52b0e0;
    background: rgba(82,176,224,0.06);
  }

  .main-menu__btn-sub {
    font-size: 11px;
    font-weight: 500;
    color: #666;
    text-transform: none;
    letter-spacing: 0;
  }
`;