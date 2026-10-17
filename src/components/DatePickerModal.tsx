import { useState } from 'react';
import { formatMMDDYYYY } from '../services/textDiary';
import { hapticTap } from '../services/utils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onProceed: (entryDate: string, title: string) => void;
}

export default function DatePickerModal({ isOpen, onClose, onProceed }: Props) {
  const [selectedDate, setSelectedDate] = useState(() => {
    // Current date formatted for html date input: YYYY-MM-DD
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = (d.getMonth() + 1).toString().padStart(2, '0');
    const dd = d.getDate().toString().padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });
  const [title, setTitle] = useState('');

  if (!isOpen) return null;

  // Convert input YYYY-MM-DD to MM/DD/YYYY
  const toMMDDYYYY = (isoDate: string): string => {
    if (!isoDate) return formatMMDDYYYY();
    const [year, month, day] = isoDate.split('-');
    return `${month}/${day}/${year}`;
  };

  const handleStartWriting = (e: React.FormEvent) => {
    e.preventDefault();
    hapticTap();
    const formattedDate = toMMDDYYYY(selectedDate);
    onProceed(formattedDate, title.trim());
  };

  return (
    <div className="pin-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="pin-modal date-picker-modal" onClick={e => e.stopPropagation()}>
        <div className="date-picker-icon-badge">📅</div>
        <h3 className="date-picker-title">New Diary Entry</h3>
        <p className="date-picker-subtitle">Choose the entry date and an optional title before writing</p>

        <form onSubmit={handleStartWriting} className="date-picker-form">
          <div className="date-picker-field">
            <label className="date-picker-label">
              <span>Entry Date</span>
              <span className="date-picker-format-badge">MM/DD/YYYY</span>
            </label>
            <input
              type="date"
              required
              className="date-picker-input"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
            />
            <span className="date-picker-hint">
              Selected: <strong>{toMMDDYYYY(selectedDate)}</strong>
            </span>
          </div>

          <div className="date-picker-field">
            <label className="date-picker-label">Entry Title (Optional)</label>
            <input
              type="text"
              className="date-picker-input text-input"
              placeholder="e.g. A peaceful morning walk"
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={100}
              autoFocus
            />
          </div>

          <div className="pin-actions">
            <button type="button" className="action-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="action-btn primary start-writing-btn">
              ✍️ Start Writing
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
