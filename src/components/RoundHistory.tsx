// src/components/RoundHistory.tsx

import { useState } from 'react';
import type { RoundHistoryEntry, SlotKey, CombatOutcome } from '../types/game';
import { SLOT_KEYS } from '../types/game';
import clsx from 'clsx';

// [BLOCK: Props]
interface RoundHistoryProps {
  history: RoundHistoryEntry[];
  defaultExpanded?: boolean;
}

// [BLOCK: Outcome Label Config]
// Mirrors Slot.tsx's OUTCOME_CONFIG so history badges match in-game badges.
const OUTCOME_LABELS: Record<CombatOutcome, string> = {
  won: 'Win',
  lost: 'Loss',
  tied: 'Tie',
  'tied-lost': 'Gone',
};

// [BLOCK: Component]
export function RoundHistory({ history, defaultExpanded = false }: RoundHistoryProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  // Most recent round first — easier to check what just happened without
  // scrolling past the whole match.
  const orderedHistory = [...history].reverse();

  return (
    <div className={clsx('round-history', expanded && 'round-history--expanded')}>

      {/* [SUB-BLOCK: Toggle Header] */}
      <button
        className="round-history__toggle"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        aria-controls="round-history-panel"
      >
        <span className="round-history__toggle-label">
          Round History {history.length > 0 && `(${history.length})`}
        </span>
        <span className="round-history__toggle-chevron" aria-hidden="true">
          {expanded ? '▾' : '▸'}
        </span>
      </button>

      {/* [SUB-BLOCK: Panel] */}
      {expanded && (
        <div id="round-history-panel" className="round-history__panel">
          {orderedHistory.length === 0 ? (
            <p className="round-history__empty">No rounds completed yet.</p>
          ) : (
            <ul className="round-history__list">
              {orderedHistory.map((entry) => (
                <li key={entry.round} className="round-history__entry">

                  <div className="round-history__entry-header">
                    <span className="round-history__round-label">
                      Round {entry.round}
                    </span>
                    <span className="round-history__counts">
                      You: {entry.playerCardsAfter} &nbsp;·&nbsp; Opponent: {entry.aiCardsAfter}
                    </span>
                  </div>

                  <div className="round-history__slots">
                    {SLOT_KEYS.map((key: SlotKey) => {
                      const outcome = entry.resolutions[key];
                      return (
                        <div
                          key={key}
                          className={clsx(
                            'round-history__slot',
                            `round-history__slot--${outcome.player}`,
                          )}
                        >
                          <span className="round-history__slot-key">{key}</span>
                          <span className="round-history__matchup">
                            <span className="round-history__player-card">
                              {entry.playerSlots[key]}
                            </span>
                            <span className="round-history__vs" aria-hidden="true">vs</span>
                            <span className="round-history__ai-card">
                              {entry.aiSlots[key]}
                            </span>
                          </span>
                          <span className="round-history__outcome-badge">
                            {OUTCOME_LABELS[outcome.player]}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                </li>
              ))}
            </ul>
          )}
        </div>
      )}

    </div>
  );
}

// [BLOCK: Styles]
export const roundHistoryStyles = `
  .round-history {
    width: 100%;
    max-width: 480px;
    border-radius: 10px;
    border: 1px solid #222;
    background: #0d0d1a;
    overflow: hidden;
  }

  .round-history__toggle {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: transparent;
    border: none;
    color: #999;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: color 0.15s, background 0.15s;
  }

  .round-history__toggle:hover {
    color: #ccc;
    background: rgba(255,255,255,0.03);
  }

  .round-history__toggle-chevron {
    font-size: 11px;
    color: #555;
  }

  .round-history__panel {
    border-top: 1px solid #1c1c2a;
    max-height: 280px;
    overflow-y: auto;
  }

  .round-history__empty {
    padding: 14px;
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
    padding: 10px 14px;
    border-bottom: 1px solid #161622;
  }

  .round-history__entry:last-child {
    border-bottom: none;
  }

  .round-history__entry-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 6px;
  }

  .round-history__round-label {
    font-size: 12px;
    font-weight: 700;
    color: #ccc;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .round-history__counts {
    font-size: 11px;
    color: #666;
  }

  .round-history__slots {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .round-history__slot {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px;
    border-radius: 6px;
    background: #111120;
  }

  .round-history__slot-key {
    width: 44px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #555;
    font-weight: 600;
  }

  .round-history__matchup {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
  }

  .round-history__player-card { color: #6a9; font-weight: 600; }
  .round-history__ai-card     { color: #c77; font-weight: 600; }
  .round-history__vs          { color: #444; font-size: 10px; }

  .round-history__outcome-badge {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 2px 6px;
    border-radius: 4px;
    white-space: nowrap;
  }

  .round-history__slot--won  .round-history__outcome-badge { background: #52c87a; color: #0a1a10; }
  .round-history__slot--lost .round-history__outcome-badge { background: #e05252; color: #1a0a0a; }
  .round-history__slot--tied .round-history__outcome-badge { background: #e0a030; color: #1a1000; }
  .round-history__slot--tied-lost .round-history__outcome-badge { background: #444; color: #aaa; }
`;