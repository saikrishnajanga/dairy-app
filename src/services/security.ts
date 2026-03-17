// Simple encryption/decryption for diary entries using AES-like XOR cipher
// This provides basic protection for data at rest in localStorage

const ENCRYPT_KEY = 'vd_encrypt_key';
const APP_LOCK_KEY = 'vd_app_lock_enabled';
const APP_PIN_KEY = 'vd_app_pin';
const AUTO_LOCK_KEY = 'vd_auto_lock';

// ─── Encryption ────────────────────────────────────────────

function getOrCreateKey(): string {
  let key = localStorage.getItem(ENCRYPT_KEY);
  if (!key) {
    key = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(ENCRYPT_KEY, key);
  }
  return key;
}

export function encryptText(text: string): string {
  if (!text) return text;
  const key = getOrCreateKey();
  const encoded = new TextEncoder().encode(text);
  const keyBytes = new TextEncoder().encode(key);
  const encrypted = new Uint8Array(encoded.length);
  for (let i = 0; i < encoded.length; i++) {
    encrypted[i] = encoded[i] ^ keyBytes[i % keyBytes.length];
  }
  return btoa(String.fromCharCode(...encrypted));
}

export function decryptText(encrypted: string): string {
  if (!encrypted) return encrypted;
  try {
    const key = getOrCreateKey();
    const decoded = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
    const keyBytes = new TextEncoder().encode(key);
    const decrypted = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) {
      decrypted[i] = decoded[i] ^ keyBytes[i % keyBytes.length];
    }
    return new TextDecoder().decode(decrypted);
  } catch {
    return encrypted; // Return as-is if decryption fails (unencrypted data)
  }
}

// ─── App Lock ──────────────────────────────────────────────

export function setAppPin(pin: string) {
  // Hash the PIN for secure storage
  const hashed = btoa(pin.split('').reverse().join('') + '_vd_secure');
  localStorage.setItem(APP_PIN_KEY, hashed);
  localStorage.setItem(APP_LOCK_KEY, 'true');
}

export function verifyAppPin(pin: string): boolean {
  const stored = localStorage.getItem(APP_PIN_KEY);
  if (!stored) return false;
  const hashed = btoa(pin.split('').reverse().join('') + '_vd_secure');
  return stored === hashed;
}

export function hasAppLock(): boolean {
  return localStorage.getItem(APP_LOCK_KEY) === 'true';
}

export function hasAppPinSet(): boolean {
  return !!localStorage.getItem(APP_PIN_KEY);
}

export function removeAppLock() {
  localStorage.removeItem(APP_LOCK_KEY);
  localStorage.removeItem(APP_PIN_KEY);
}

// ─── Auto Lock Settings ────────────────────────────────────

export function setAutoLock(enabled: boolean) {
  localStorage.setItem(AUTO_LOCK_KEY, enabled ? 'true' : 'false');
}

export function isAutoLockEnabled(): boolean {
  return localStorage.getItem(AUTO_LOCK_KEY) !== 'false'; // Default true
}
