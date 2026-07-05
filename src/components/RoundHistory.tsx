// src/components/RoundHistory.tsx

import type { RoundHistoryEntry, SlotKey, CombatOutcome, CascadeFightLog, Owner } from '../types/game';
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
// 'cascaded' gets its own label/class — the lane's RPS matchup was won,
// but the card was discarded afterward in the cascade fight, so it reads
// differently from both a plain "Win" and a plain "Loss" (see
// useGameState.ts's RECORD_HISTORY, which now stores the post-cascade
// outcome here rather than the raw pre-cascade one).
const OUTCOME_LABELS: Record<CombatOutcome, string> = {
  won: 'Win',
  lost: 'Loss',
  cascaded: 'Cascaded',
  tied: 'Tie',
  'tied-lost': 'Spent',
  dragon: 'Win',
};

// [BLOCK: Cascade Fight Log Formatting]
// Renders combat.ts's CascadeFightLog entries as short, plain-language
// lines — "who fought whom, who came out on top" — in Left -> Center ->
// Right chain order (the order they occurred in). Kept purely descriptive;
// no new game logic here, just formatting already-computed data.
function slotLabel(key: SlotKey): string {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function ownerLabel(owner: Owner): string {
  return owner === 'player' ? 'You' : 'AI';
}

function formatFightLine(fight: CascadeFightLog): string {
  const champ = `${slotLabel(fight.championSlot)} (${ownerLabel(fight.championOwner)})`;
  const chall = `${slotLabel(fight.challengerSlot)} (${ownerLabel(fight.challengerOwner)})`;

  switch (fight.outcome) {
    case 'championWon':
      return `${champ} held against ${chall}`;
    case 'challengerWon':
      return `${chall} took down ${champ}`;
    case 'tied':
      return `${champ} and ${chall} tied — chain halted`;
    case 'tiedLost':
      return `${champ} and ${chall} both fell to an exhausted tie — chain halted`;
    default:
      return '';
  }
}

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
              const cascadeTriggered = entry.cascade?.triggered ?? false;

              return (
                <li key={entry.round} className="round-history__entry">

                  <div className="round-history__entry-header">
                    <span className="round-history__round-label">
                      Round {entry.round}
                      {cascadeTriggered && (
                        <span className="round-history__cascade-tag" title="Cascade combat occurred this round">
                          ⚔ Cascade
                        </span>
                      )}
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

                  {/* [SUB-BLOCK: Cascade Fight Log] — only rendered when a
                      cascade actually ran with at least one fight (0 or 1
                      lane-winners never trigger one; see combat.ts's
                      resolveCascade). Plain-language, in chain order. */}
                  {cascadeTriggered && entry.cascade!.log.length > 0 && (
                    <ul className="round-history__cascade-log">
                      {entry.cascade!.log.map((fight, i) => (
                        <li key={i} className="round-history__cascade-log-line">
                          {formatFightLine(fight)}
                        </li>
                      ))}
                    </ul>
                  )}

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
    gap: 6px;
  }

  .round-history__round-label {
    font-size: 11px;
    font-weight: 700;
    color: #ccc;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  /* [BLOCK: Cascade Tag] */
  .round-history__cascade-tag {
    font-size: 9px;
    font-weight: 700;
    text-transform: none;
    letter-spacing: 0.02em;
    color: #9d6fe0;
    background: rgba(157,111,224,0.12);
    border: 1px solid rgba(157,111,224,0.4);
    border-radius: 4px;
    padding: 1px 5px;
    white-space: nowrap;
  }

  .round-history__counts {
    font-size: 10px;
    color: #666;
    flex-shrink: 0;
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
  .round-history__slot--cascaded .round-history__outcome-badge { background: #9d6fe0; color: #1a0f2a; }
  .round-history__slot--tied .round-history__outcome-badge { background: #e0a030; color: #1a1000; }
  .round-history__slot--tied-lost .round-history__outcome-badge { background: #444; color: #aaa; }
  .round-history__slot--dragon .round-history__outcome-badge { background: #f0c040; color: #2a1a00; }

  /* [BLOCK: Cascade Fight Log] */
  .round-history__cascade-log {
    list-style: none;
    margin: 6px 0 0;
    padding: 6px 8px;
    border-radius: 6px;
    background: rgba(157,111,224,0.06);
    border: 1px dashed rgba(157,111,224,0.25);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .round-history__cascade-log-line {
    font-size: 10px;
    color: #b39ddb;
    line-height: 140%;
  }
`;