// src/components/RoundHistory.tsx

import type { RoundHistoryEntry, SlotKey, CombatOutcome } from '../types/game';
import { SLOT_KEYS } from '../types/game';
import clsx from 'clsx';

// [BLOCK: Props]
// Phase 4 layout redesign: this is now permanent sidebar content (per the
// layout sketch) rather than a collapsible panel — the toggle/expanded
// state from 3.6 is gone. It fills the space between the round counter and
// the Play button, scrolling internally so it never grows the page.
interface RoundHistoryProps {
  history: RoundHistoryEntry[];
}

// [BLOCK: Outcome Label Config]
// 'dragon' maps to the same "Win" label as a plain 'won' — it's the
// Dragon's owner's own lane, framed as a deliberate wipe rather than a
// loss (see types/game.ts's SlotState doc comment).
const OUTCOME_LABELS: Record<CombatOutcome, string> = {
  won: 'Win',
  lost: 'Loss',
  tied: 'Tie',
  'tied-lost': 'Spent',
  dragon: 'Win',
};

// [BLOCK: Component]
export function RoundHistory({ history }: RoundHistoryProps) {
  // Most recent round first
  const orderedHistory = [...history].reverse();

  return (
    <div className="round-history">
      <span className="round-history__heading">
        Round History {history.length > 0 && `(${history.length})`}
      </span>

      <div className="round-history__panel">
        {orderedHistory.length === 0 ? (
          <p className="round-history__empty">No rounds completed yet.</p>
        ) : (
          <ul className="round-history__list">
            {orderedHistory.map((entry) => {
              // A single-Dragon round (dragonSide set) wipes every lane in
              // the Dragon owner's favor — per design, ALL 3 lanes display
              // as "Dragon vs {opponent type} — Win" for that side, not
              // just the lane the Dragon card physically occupied. A
              // both-sides-Dragon round leaves dragonSide null (it's a
              // cancel, not a wipe), so it falls through to normal display.
              const isDragonRound = entry.dragonSide !== null;

              return (
                <li key={entry.round} className="round-history__entry">

                  <div className="round-history__entry-header">
                    <span className="round-history__round-label">
                      Round {entry.round}
                    </span>
                    <span className="round-history__counts">
                      {entry.playerCardsAfter} · {entry.aiCardsAfter}
                    </span>
                  </div>

                  <div className="round-history__slots">
                    {SLOT_KEYS.map((key: SlotKey) => {
                      const outcome = entry.resolutions[key];

                      let leftLabel: string = entry.playerSlots[key];
                      let rightLabel: string = entry.aiSlots[key];
                      let showLeftDragonIcon = false;
                      let showRightDragonIcon = false;

                      if (isDragonRound) {
                        if (entry.dragonSide === 'player') {
                          leftLabel = 'Dragon';
                          showLeftDragonIcon = true;
                        } else if (entry.dragonSide === 'ai') {
                          rightLabel = 'Dragon';
                          showRightDragonIcon = true;
                        }
                      }

                      return (
                        <div
                          key={key}
                          className={clsx(
                            'round-history__slot',
                            `round-history__slot--${outcome.player}`,
                          )}
                        >
                          <span className="round-history__matchup">
                            {showLeftDragonIcon && <span aria-hidden="true">🐉</span>}
                            {leftLabel}
                            <span className="round-history__vs" aria-hidden="true">vs</span>
                            {showRightDragonIcon && <span aria-hidden="true">🐉</span>}
                            {rightLabel}
                          </span>
                          <span className="round-history__outcome-badge">
                            {OUTCOME_LABELS[outcome.player]}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// [BLOCK: Styles]
export const roundHistoryStyles = `
  .round-history {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    border-radius: 10px;
    border: 1px solid #222;
    background: #0d0d1a;
    overflow: hidden;
  }

  .round-history__heading {
    padding: 10px 12px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #888;
    border-bottom: 1px solid #1c1c2a;
    flex-shrink: 0;
  }

  .round-history__panel {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  .round-history__empty {
    padding: 14px 12px;
    margin: 0;
    font-size: 12px;
    color: #555;
    font-style: italic;
  }

  .round-history__list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .round-history__entry {
    padding: 8px 12px;
    border-bottom: 1px solid #161622;
  }

  .round-history__entry:last-child {
    border-bottom: none;
  }

  .round-history__entry-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 5px;
  }

  .round-history__round-label {
    font-size: 11px;
    font-weight: 700;
    color: #ccc;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .round-history__counts {
    font-size: 10px;
    color: #666;
  }

  .round-history__slots {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .round-history__slot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    padding: 3px 6px;
    border-radius: 5px;
    background: #111120;
  }

  .round-history__matchup {
    font-size: 11px;
    color: #999;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .round-history__vs {
    color: #444;
    font-size: 9px;
  }

  .round-history__outcome-badge {
    font-size: 8px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 2px 5px;
    border-radius: 4px;
    white-space: nowrap;
  }

  .round-history__slot--won  .round-history__outcome-badge { background: #52c87a; color: #0a1a10; }
  .round-history__slot--lost .round-history__outcome-badge { background: #e05252; color: #1a0a0a; }
  .round-history__slot--tied .round-history__outcome-badge { background: #e0a030; color: #1a1000; }
  .round-history__slot--tied-lost .round-history__outcome-badge { background: #444; color: #aaa; }
  .round-history__slot--dragon .round-history__outcome-badge { background: #f0c040; color: #2a1a00; }
`;