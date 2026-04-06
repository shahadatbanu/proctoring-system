// src/components/ConfirmModal.jsx
import React from 'react';

/**
 * Usage:
 * <ConfirmModal
 *   open={showConfirm}
 *   title="Submit Exam?"
 *   message="You have 3 unanswered questions. Are you sure?"
 *   confirmLabel="Submit"
 *   cancelLabel="Keep going"
 *   onConfirm={handleSubmit}
 *   onCancel={() => setShowConfirm(false)}
 *   danger
 * />
 */
export default function ConfirmModal({
  open, title, message,
  confirmLabel = 'Confirm',
  cancelLabel  = 'Cancel',
  onConfirm, onCancel,
  danger = false,
}) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">{title}</h3>
        {message && <p className="modal-message">{message}</p>}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            className={danger ? 'btn-danger' : 'btn-primary'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
