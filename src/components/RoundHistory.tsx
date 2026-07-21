// src/components/RoundHistory.tsx

import type { RoundHistoryEntry, SlotKey, CombatOutcome, CascadeFightLog, Owner } from '../types/game';
import { SLOT_KEYS } from '../types/game';
import clsx from 'clsx';
import styles from '../styles/RoundHistory.module.css';

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
// [Card Scarcity] 'empty' is new — this side had no card in this slot at
// all this round (its stack was empty and hand couldn't reach 3 either;
// see types/game.ts's getPlacementCap). Shown as a plain dash rather than
// a colored win/loss badge — it's not a combat result, just an absence.
const OUTCOME_LABELS: Record<CombatOutcome, string> = {
  won: 'Win',
  lost: 'Loss',
  cascaded: 'Cascaded',
  tied: 'Tie',
  'tied-lost': 'Spent',
  dragon: 'Win',
  empty: '—',
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
    <div className={styles['round-history']}>
      <span className={styles['round-history__heading']}>
        Round History {history.length > 0 && `(${history.length})`}
      </span>

      <div className={styles['round-history__panel']}>
        {orderedHistory.length === 0 ? (
          <p className={styles['round-history__empty']}>No rounds completed yet.</p>
        ) : (
          <ul className={styles['round-history__list']}>
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
                <li key={entry.round} className={styles['round-history__entry']}>

                  <div className={styles['round-history__entry-header']}>
                    <span className={styles['round-history__round-label']}>
                      Round {entry.round}
                      {cascadeTriggered && (
                        <span className={styles['round-history__cascade-tag']} title="Cascade combat occurred this round">
                          ⚔ Cascade
                        </span>
                      )}
                    </span>
                    <span className={styles['round-history__counts']}>
                      {entry.playerCardsAfter} · {entry.aiCardsAfter}
                    </span>
                  </div>

                  <div className={styles['round-history__slots']}>
                    {SLOT_KEYS.map((key: SlotKey) => {
                      const outcome = entry.resolutions[key];

                      // [Card Scarcity] entry.playerSlots[key]/aiSlots[key]
                      // are nullable now — a slot with no card this round
                      // (see types/game.ts's RoundHistoryEntry doc
                      // comment) falls back to a plain dash instead of a
                      // card type name.
                      let leftLabel: string = entry.playerSlots[key] ?? '—';
                      let rightLabel: string = entry.aiSlots[key] ?? '—';
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
                            styles['round-history__slot'],
                            styles[`round-history__slot--${outcome.player}`],
                          )}
                        >
                          <span className={styles['round-history__matchup']}>
                            {showLeftDragonIcon && <span aria-hidden="true">🐉</span>}
                            {leftLabel}
                            <span className={styles['round-history__vs']} aria-hidden="true">vs</span>
                            {showRightDragonIcon && <span aria-hidden="true">🐉</span>}
                            {rightLabel}
                          </span>
                          <span className={styles['round-history__outcome-badge']}>
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
                    <ul className={styles['round-history__cascade-log']}>
                      {entry.cascade!.log.map((fight, i) => (
                        <li key={i} className={styles['round-history__cascade-log-line']}>
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