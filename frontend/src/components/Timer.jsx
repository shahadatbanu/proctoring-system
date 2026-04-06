// src/components/Timer.jsx
import React from 'react';

export default function Timer({ timeLeft }) {
  if (timeLeft === null) return null;

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const display = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  const urgent  = timeLeft < 300;   // < 5 minutes

  return (
    <div className={`timer ${urgent ? 'timer-urgent' : ''}`}>
      ⏱ {display}
    </div>
  );
}
