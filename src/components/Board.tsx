// src/components/Board.tsx

import type { BoardSlots, SlotKey } from '../types/game';
import { SLOT_KEYS } from '../types/game';
import { Slot } from './Slot';
import clsx from 'clsx';

// [BLOCK: Props]
interface BoardProps {
  playerSlots: BoardSlots;
  aiSlots: BoardSlots;
  revealingSlot?: SlotKey | null; // which slot is currently mid-reveal
}

// [BLOCK: Component]
export function Board({ playerSlots, aiSlots, revealingSlot }: BoardProps) {
  return (
    <div className="board">

      {/* [SUB-BLOCK: AI Row] */}
      <div className="board__row board__row--ai">
        <span className="board__row-label">Opponent</span>
        <div className="board__slots">
          {SLOT_KEYS.map((key) => (
            <Slot
              key={key}
              slot={aiSlots[key]}
              owner="ai"
              isRevealing={revealingSlot === key}
            />
          ))}
        </div>
      </div>

      {/* [SUB-BLOCK: Divider] */}
      <div className="board__divider" aria-hidden="true">
        <span className="board__divider-label">vs</span>
      </div>

      {/* [SUB-BLOCK: Player Row] */}
      <div className="board__row board__row--player">
        <span className="board__row-label">You</span>
        <div className="board__slots">
          {SLOT_KEYS.map((key) => (
            <Slot
              key={key}
              slot={playerSlots[key]}
              owner="player"
              isRevealing={revealingSlot === key}
            />
          ))}
        </div>
      </div>

      {/* [SUB-BLOCK: Slot Column Labels] */}
      <div className="board__col-labels" aria-hidden="true">
        {SLOT_KEYS.map((key) => (
          <span key={key} className="board__col-label">{key}</span>
        ))}
      </div>

    </div>
  );
}

// [BLOCK: Board Styles]
export const boardStyles = `
  .board {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 24px 16px;
    background: #0d0d1a;
    border-radius: 16px;
    border: 1px solid #222;
    width: fit-content;
    margin: 0 auto;
  }

  .board__row {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  .board__row-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-weight: 600;
    color: #555;
  }

  .board__row--player .board__row-label {
    color: #6a9;
  }

  .board__row--ai .board__row-label {
    color: #a66;
  }

  .board__slots {
    display: flex;
    gap: 12px;
  }

  .board__divider {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 4px;
  }

  .board__divider::before,
  .board__divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: #222;
  }

  .board__divider-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #333;
    font-weight: 700;
  }

  .board__col-labels {
    display: flex;
    gap: 12px;
    margin-top: -4px;
  }

  .board__col-label {
    width: 88px;
    text-align: center;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #333;
    font-weight: 600;
  }
`;