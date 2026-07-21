// src/components/RotatePrompt.tsx

import styles from '../styles/RotatePrompt.module.css';

// [BLOCK: Mobile Responsiveness]
export function RotatePrompt() {
  return (
    <div className={styles['rotate-prompt']} role="alert" aria-live="assertive">
      <div className={styles['rotate-prompt__icon']} aria-hidden="true">
        <svg viewBox="0 0 100 100" width="64" height="64">
          <rect
            x="30"
            y="10"
            width="40"
            height="70"
            rx="6"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
          />
          <circle cx="50" cy="72" r="3" fill="currentColor" />
        </svg>
      </div>
      <p className={styles['rotate-prompt__text']}>Rotate your device to play</p>
    </div>
  );
}