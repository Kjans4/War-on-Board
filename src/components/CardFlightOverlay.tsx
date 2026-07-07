// src/components/CardFlightOverlay.tsx

import { useEffect, useState } from 'react';
import type { Card as GameCard } from '../types/game';
import { Card } from './Card';
import styles from '../styles/CardFlightOverlay.module.css';

// [BLOCK: Flight Item]
// One card in transit between two measured DOM rects. fromRect/toRect are
// plain DOMRect snapshots taken by the caller (App.tsx) at the moment the
// flight is built — this component never measures anything itself, it
// only animates between two fixed points (FLIP-lite: no live remeasurement
// mid-flight, since both endpoints are static UI landmarks — slots, stack
// icons, discard piles — for the lifetime of a single flight).
export interface FlightItem {
  id: string;
  card: GameCard;
  fromRect: DOMRect;
  toRect: DOMRect;
  faceDown: boolean;
}

interface CardFlightOverlayProps {
  flights: FlightItem[];
  durationMs: number;
}

type FlightPhase = 'start' | 'end';

// [BLOCK: Component]
// Renders one absolutely-positioned ghost Card per flight, mounted at
// fromRect, then flipped to toRect one frame later so the CSS transition
// on top/left/width/height actually has something to interpolate between.
// Purely visual — never dispatches, never owns game state. The caller is
// responsible for clearing `flights` once durationMs has elapsed (or
// immediately, on skip).
export function CardFlightOverlay({ flights, durationMs }: CardFlightOverlayProps) {
  const [phaseById, setPhaseById] = useState<Record<string, FlightPhase>>({});

  useEffect(() => {
    if (flights.length === 0) return;

    const atStart: Record<string, FlightPhase> = {};
    for (const f of flights) atStart[f.id] = 'start';
    setPhaseById(atStart);

    const raf = requestAnimationFrame(() => {
      const atEnd: Record<string, FlightPhase> = {};
      for (const f of flights) atEnd[f.id] = 'end';
      setPhaseById(atEnd);
    });

    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flights]);

  if (flights.length === 0) return null;

  return (
    <div className={styles['card-flight-overlay']} aria-hidden="true">
      {flights.map((f) => {
        const rect = phaseById[f.id] === 'end' ? f.toRect : f.fromRect;
        return (
          <div
            key={f.id}
            className={styles['card-flight-overlay__item']}
            style={{
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
              transitionDuration: `${durationMs}ms`,
            }}
          >
            <Card card={f.card} faceDown={f.faceDown} />
          </div>
        );
      })}
    </div>
  );
}