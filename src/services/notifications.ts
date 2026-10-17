// ═══════════════════════════════════════════════════════════
//  VoiceDiary Pro — Notification Service
//  Driven by real application events:
//   - Account registration & verification
//   - Password recovery & security events
//   - Document upload / delete events
//   - Diary sync failures / retries
//   - Voice recording status
//   - Optional user-controlled daily diary reminders
// ═══════════════════════════════════════════════════════════

import {
  dbGetNotifications,
  dbSaveNotification,
  dbMarkNotificationRead,
  dbClearAllNotifications,
  type AppNotification,
} from './db';
import { genId } from './utils';

const REMINDER_KEY = 'vd_diary_reminder_enabled';
const REMINDER_TIME_KEY = 'vd_diary_reminder_time';

export type NotificationEvent =
  | 'AUTH_WELCOME'
  | 'AUTH_VERIFIED'
  | 'SECURITY_PIN_CHANGED'
  | 'SECURITY_LOCK_ENABLED'
  | 'SECURITY_RECOVERY_COMPLETED'
  | 'DOC_UPLOAD_SUCCESS'
  | 'DOC_UPLOAD_FAILED'
  | 'SYNC_SUCCESS'
  | 'SYNC_FAILED'
  | 'VOICE_RECORDING_SAVED'
  | 'REMINDER';

export async function addNotification(opts: {
  title: string;
  message: string;
  type?: AppNotification['type'];
  userId?: string;
  actionUrl?: string;
}): Promise<AppNotification> {
  const notif: AppNotification = {
    id: genId(),
    userId: opts.userId,
    title: opts.title,
    message: opts.message,
    type: opts.type || 'info',
    timestamp: Date.now(),
    read: false,
    actionUrl: opts.actionUrl,
  };

  try {
    await dbSaveNotification(notif);
  } catch (e) {
    console.warn('Could not save notification to IndexedDB:', e);
  }
  return notif;
}

export async function getNotifications(): Promise<AppNotification[]> {
  try {
    return await dbGetNotifications();
  } catch {
    return [];
  }
}

export async function markNotificationAsRead(id: string): Promise<void> {
  try {
    await dbMarkNotificationRead(id);
  } catch (e) {
    console.warn('Failed to mark notification read:', e);
  }
}

export async function clearAllNotifications(): Promise<void> {
  try {
    await dbClearAllNotifications();
  } catch (e) {
    console.warn('Failed to clear notifications:', e);
  }
}

// ─── Daily Reminder Controls ───────────────────────────────

export function isReminderEnabled(): boolean {
  return localStorage.getItem(REMINDER_KEY) === 'true';
}

export function setReminderEnabled(enabled: boolean): void {
  localStorage.setItem(REMINDER_KEY, enabled ? 'true' : 'false');
  if (enabled && 'Notification' in window && Notification.permission === 'default') {
    void Notification.requestPermission();
  }
}

export function getReminderTime(): string {
  return localStorage.getItem(REMINDER_TIME_KEY) || '20:00';
}

export function setReminderTime(time: string): void {
  localStorage.setItem(REMINDER_TIME_KEY, time);
}
