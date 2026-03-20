interface Props {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({ message, onConfirm, onCancel }: Props) {
  return (
    <div className="pin-overlay" onClick={onCancel}>
      <div className="pin-modal" onClick={e => e.stopPropagation()}>
        <h3>⚠️ Confirm</h3>
        <p style={{ color: 'var(--text-secondary)', margin: '12px 0 20px', fontSize: 14 }}>
          {message}
        </p>
        <div className="pin-actions">
          <button className="pin-cancel" onClick={onCancel}>Cancel</button>
          <button className="pin-submit" onClick={onConfirm} style={{ background: '#e74c3c' }}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
