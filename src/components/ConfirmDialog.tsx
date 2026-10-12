interface Props {
  message: string;
  title?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  message,
  title = 'Delete Entry?',
  confirmLabel = 'Delete',
  onConfirm,
  onCancel
}: Props) {
  return (
    <div className="pin-overlay" onClick={onCancel} role="dialog" aria-modal="true">
      <div className="pin-modal confirm-modal" onClick={e => e.stopPropagation()}>
        <div className="confirm-icon-badge">🗑️</div>
        <h3 className="confirm-title">{title}</h3>
        <p className="confirm-message">
          {message}
        </p>
        <div className="pin-actions confirm-actions">
          <button className="pin-cancel action-btn" onClick={onCancel}>Cancel</button>
          <button className="pin-submit action-btn danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
