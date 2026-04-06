// src/components/LoadingSpinner.jsx
import React from 'react';

export default function LoadingSpinner({ message = 'Loading…', fullScreen = false }) {
  const inner = (
    <div className="spinner-wrapper">
      <div className="spinner" />
      {message && <p className="spinner-msg">{message}</p>}
    </div>
  );

  if (fullScreen) {
    return <div className="spinner-fullscreen">{inner}</div>;
  }
  return inner;
}
