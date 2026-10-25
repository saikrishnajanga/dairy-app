import { useState, useEffect, useCallback } from 'react';
import {
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  clearAllNotifications,
  isReminderEnabled,
  setReminderEnabled,
  getReminderTime,
  setReminderTime,
} from '../services/notifications';
import type { AppNotification } from '../services/db';
import { hapticTap } from '../services/utils';
import { TrashIcon, BackIcon } from './Icons';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  showToast: (msg: string) => void;
}

export default function NotificationPanel({ isOpen, onClose, showToast }: Props) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [reminderActive, setReminderActive] = useState(isReminderEnabled());
  const [reminderTimeVal, setReminderTimeVal] = useState(getReminderTime());

  const loadNotifs = useCallback(async () => {
    const list = await getNotifications();
    setNotifications(list);
  }, []);

  useEffect(() => {
    if (isOpen) {
      void loadNotifs();
    }
  }, [isOpen, loadNotifs]);

  // Support closing via Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleBack = () => {
    hapticTap();
    onClose();
  };

  const handleMarkRead = async (id: string) => {
    hapticTap();
    await markNotificationAsRead(id);
    await loadNotifs();
  };

  const handleMarkAllRead = async () => {
    hapticTap();
    await markAllNotificationsAsRead();
    await loadNotifs();
    showToast('✓ All notifications marked as read');
  };

  const handleClearAll = async () => {
    hapticTap();
    await clearAllNotifications();
    await loadNotifs();
    showToast('Notifications cleared');
  };

  const handleToggleReminder = () => {
    const next = !reminderActive;
    setReminderActive(next);
    setReminderEnabled(next);
    showToast(next ? '🔔 Daily journal reminder enabled' : '🔕 Reminder disabled');
  };

  const handleReminderTimeChange = (time: string) => {
    setReminderTimeVal(time);
    setReminderTime(time);
  };

  const formatTimestamp = (ts: number) => {
    const diffMs = Date.now() - ts;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const getNotifIcon = (type: AppNotification['type']) => {
    switch (type) {
      case 'success': return '✅';
      case 'warning': return '⚠️';
      case 'error': return '❌';
      case 'security': return '🛡️';
      default: return 'ℹ️';
    }
  };

  return (
    <div className="pin-overlay notif-overlay" onClick={handleBack} role="dialog" aria-modal="true" aria-label="Notifications Panel">
      <div className="notification-drawer" onClick={e => e.stopPropagation()}>
        <div className="notif-header">
          <div className="notif-header-title-row">
            <button
              type="button"
              className="notif-back-btn"
              onClick={handleBack}
              title="Go back"
              aria-label="Go back"
            >
              <BackIcon size={16} />
              <span className="notif-back-btn-text">Back</span>
            </button>

            <h3 className="notif-title">
              <span className="notif-title-bell">🔔</span>
              <span className="notif-title-name">Notifications</span>
              {notifications.filter(n => !n.read).length > 0 && (
                <span className="notif-header-unread-badge">
                  {notifications.filter(n => !n.read).length}
                </span>
              )}
            </h3>

            <button
              type="button"
              className="notif-close-btn"
              onClick={handleBack}
              title="Close notifications"
              aria-label="Close notifications"
            >
              ✕
            </button>
          </div>

          <div className="notif-reminder-toggle-bar">
            <div className="reminder-info">
              <span className="reminder-title">Daily Journal Reminder</span>
              <span className="reminder-desc">Gentle prompt to reflect each day</span>
            </div>
            <div className="reminder-actions-group">
              {reminderActive && (
                <input
                  type="time"
                  className="reminder-time-input"
                  value={reminderTimeVal}
                  onChange={e => handleReminderTimeChange(e.target.value)}
                />
              )}
              <button
                type="button"
                className={`toggle-switch ${reminderActive ? 'active' : ''}`}
                onClick={handleToggleReminder}
                aria-label="Toggle daily reminder"
              >
                <div className="toggle-knob" />
              </button>
            </div>
          </div>
        </div>

        <div className="notif-body">
          {notifications.length === 0 ? (
            <div className="notif-empty">
              <span className="notif-empty-icon">🔕</span>
              <p className="notif-empty-title">All caught up!</p>
              <p className="notif-empty-desc">
                Important account, sync, and security updates will appear here.
              </p>
              <button
                type="button"
                className="action-btn notif-empty-back-btn"
                onClick={handleBack}
                title="Return to notes"
              >
                <BackIcon size={15} />
                <span>Back to Diary</span>
              </button>
            </div>
          ) : (
            <div className="notif-list">
              {notifications.map(notif => (
                <div
                  key={notif.id}
                  className={`notif-item ${notif.read ? 'read' : 'unread'}`}
                  onClick={() => !notif.read && handleMarkRead(notif.id)}
                >
                  <span className="notif-type-icon">{getNotifIcon(notif.type)}</span>
                  <div className="notif-item-content">
                    <div className="notif-item-top">
                      <h4 className="notif-item-title">{notif.title}</h4>
                      <span className="notif-time">{formatTimestamp(notif.timestamp)}</span>
                    </div>
                    <p className="notif-message">{notif.message}</p>
                  </div>
                  {!notif.read && <span className="notif-unread-dot" />}
                </div>
              ))}
            </div>
          )}
        </div>

        {notifications.length > 0 && (
          <div className="notif-footer" style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '10px 16px' }}>
            {notifications.some(n => !n.read) && (
              <button
                type="button"
                className="action-btn text-btn"
                onClick={handleMarkAllRead}
                style={{ color: 'var(--primary-text)' }}
              >
                ✓ Mark all as read
              </button>
            )}
            <button type="button" className="action-btn text-btn" onClick={handleClearAll} style={{ color: 'var(--danger)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <TrashIcon size={14} /> Clear all
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
