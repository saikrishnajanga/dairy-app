// ═══════════════════════════════════════════════════════════
//  VoiceDiary Pro — AES-GCM 256-bit Cryptographic Service
//  Provides military-grade client-side encryption for Locked Diaries:
//   - PBKDF2 (SHA-256, 100,000 iterations) for key derivation
//   - AES-GCM with unique 96-bit IV per ciphertext
//   - Master Key wrapping for secure password recovery without data loss
// ═══════════════════════════════════════════════════════════

const PBKDF2_ITERATIONS = 100000;
const MASTER_KEY_STORAGE = 'vd_master_key_wrapped';
const RECOVERY_KEY_STORAGE = 'vd_recovery_key_wrapped';
const SALT_STORAGE = 'vd_lock_salt';
const RECOVERY_SALT_STORAGE = 'vd_recovery_salt';
const LOCK_PASS_HASH = 'vd_lock_pass_hash';

// In-memory unlocked session master key (cleared on lock / session timeout / logout)
let activeMasterKey: CryptoKey | null = null;
let unlockExpiryTimer: ReturnType<typeof setTimeout> | null = null;
const SESSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes auto-lock timeout

// ─── Utility Helpers ───────────────────────────────────────

function bufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function getOrGenerateSalt(storageKey: string): Uint8Array {
  const existing = localStorage.getItem(storageKey);
  if (existing) {
    return base64ToBuffer(existing);
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  localStorage.setItem(storageKey, bufferToBase64(salt));
  return salt;
}

// ─── Key Derivation ────────────────────────────────────────

async function deriveKeyFromPassword(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
  );
}

export async function hashPasswordForVerification(password: string): Promise<string> {
  const salt = getOrGenerateSalt(SALT_STORAGE);
  const enc = new TextEncoder();
  const data = new Uint8Array(salt.length + enc.encode(password).length);
  data.set(salt, 0);
  data.set(enc.encode(password), salt.length);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return bufferToBase64(hash);
}

// ─── Master Key Generation & Wrapping ──────────────────────

/**
 * Initializes or resets the lock password.
 * Generates an AES-256 master key, wraps it with the password key,
 * and if recoveryAccountToken is provided (e.g. user id / email), wraps it for recovery.
 */
export async function setupDiaryLock(password: string, recoveryToken?: string): Promise<void> {
  const salt = getOrGenerateSalt(SALT_STORAGE);
  const passKey = await deriveKeyFromPassword(password, salt);

  // Generate a random master key for all locked diary entries
  const masterKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );

  // Wrap master key with the password key
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await crypto.subtle.wrapKey('raw', masterKey, passKey, {
    name: 'AES-GCM',
    iv,
  });

  const wrappedPayload = JSON.stringify({
    iv: bufferToBase64(iv),
    data: bufferToBase64(wrapped),
  });
  localStorage.setItem(MASTER_KEY_STORAGE, wrappedPayload);

  // Store password verification hash
  const hash = await hashPasswordForVerification(password);
  localStorage.setItem(LOCK_PASS_HASH, hash);

  // Wrap with recovery token if present
  if (recoveryToken) {
    const recSalt = getOrGenerateSalt(RECOVERY_SALT_STORAGE);
    const recKey = await deriveKeyFromPassword(recoveryToken, recSalt);
    const recIv = crypto.getRandomValues(new Uint8Array(12));
    const recWrapped = await crypto.subtle.wrapKey('raw', masterKey, recKey, {
      name: 'AES-GCM',
      iv: recIv,
    });
    localStorage.setItem(
      RECOVERY_KEY_STORAGE,
      JSON.stringify({
        iv: bufferToBase64(recIv),
        data: bufferToBase64(recWrapped),
      })
    );
  }

  // Set active session
  setActiveSessionKey(masterKey);
}

export function hasDiaryLockSet(): boolean {
  return !!localStorage.getItem(MASTER_KEY_STORAGE) && !!localStorage.getItem(LOCK_PASS_HASH);
}

export function isLockedSessionActive(): boolean {
  return activeMasterKey !== null;
}

export function lockSession(): void {
  activeMasterKey = null;
  if (unlockExpiryTimer) {
    clearTimeout(unlockExpiryTimer);
    unlockExpiryTimer = null;
  }
}

function setActiveSessionKey(key: CryptoKey): void {
  activeMasterKey = key;
  if (unlockExpiryTimer) clearTimeout(unlockExpiryTimer);
  unlockExpiryTimer = setTimeout(() => {
    lockSession();
  }, SESSION_TIMEOUT_MS);
}

/** Reset the auto-lock countdown timer on user interaction */
export function touchLockedSession(): void {
  if (activeMasterKey) {
    if (unlockExpiryTimer) clearTimeout(unlockExpiryTimer);
    unlockExpiryTimer = setTimeout(() => {
      lockSession();
    }, SESSION_TIMEOUT_MS);
  }
}

/**
 * Unlocks the locked diaries session using the password.
 */
export async function unlockDiarySession(password: string): Promise<boolean> {
  const wrappedRaw = localStorage.getItem(MASTER_KEY_STORAGE);
  if (!wrappedRaw) return false;

  try {
    const salt = getOrGenerateSalt(SALT_STORAGE);
    const passKey = await deriveKeyFromPassword(password, salt);
    const { iv, data } = JSON.parse(wrappedRaw);

    const masterKey = await crypto.subtle.unwrapKey(
      'raw',
      base64ToBuffer(data) as BufferSource,
      passKey,
      { name: 'AES-GCM', iv: base64ToBuffer(iv) as BufferSource },
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );

    setActiveSessionKey(masterKey);
    return true;
  } catch (e) {
    console.warn('Failed to unlock diary session:', e);
    return false;
  }
}

/**
 * Recovers lock password via recovery token (e.g. verified user email OTP).
 * Unwraps the master key using the recovery key, and re-wraps it with the new password.
 */
export async function recoverDiaryPassword(
  recoveryToken: string,
  newPassword: string
): Promise<boolean> {
  const recWrappedRaw = localStorage.getItem(RECOVERY_KEY_STORAGE);
  if (!recWrappedRaw) {
    throw new Error('No recovery key found for this account. Recovery is only available if enabled during setup.');
  }

  try {
    const recSalt = getOrGenerateSalt(RECOVERY_SALT_STORAGE);
    const recKey = await deriveKeyFromPassword(recoveryToken, recSalt);
    const { iv, data } = JSON.parse(recWrappedRaw);

    const masterKey = await crypto.subtle.unwrapKey(
      'raw',
      base64ToBuffer(data) as BufferSource,
      recKey,
      { name: 'AES-GCM', iv: base64ToBuffer(iv) as BufferSource },
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );

    // Now re-wrap master key with the new password
    const salt = getOrGenerateSalt(SALT_STORAGE);
    const passKey = await deriveKeyFromPassword(newPassword, salt);
    const newIv = crypto.getRandomValues(new Uint8Array(12));
    const newWrapped = await crypto.subtle.wrapKey('raw', masterKey, passKey, {
      name: 'AES-GCM',
      iv: newIv,
    });

    localStorage.setItem(
      MASTER_KEY_STORAGE,
      JSON.stringify({
        iv: bufferToBase64(newIv),
        data: bufferToBase64(newWrapped),
      })
    );

    const hash = await hashPasswordForVerification(newPassword);
    localStorage.setItem(LOCK_PASS_HASH, hash);

    setActiveSessionKey(masterKey);
    return true;
  } catch (e) {
    console.error('Password recovery unwrap error:', e);
    return false;
  }
}

// ─── Entry Encryption & Decryption ─────────────────────────

export interface EncryptedPayload {
  iv: string;
  ciphertext: string;
  isEncrypted: true;
}

export async function encryptDiaryContent(plaintext: string): Promise<string> {
  if (!plaintext) return '';
  if (!activeMasterKey) {
    throw new Error('Diary lock session is not active. Unlock first.');
  }

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    activeMasterKey,
    encoded
  );

  const payload: EncryptedPayload = {
    iv: bufferToBase64(iv),
    ciphertext: bufferToBase64(ciphertext),
    isEncrypted: true,
  };

  return 'ENC:' + JSON.stringify(payload);
}

export async function decryptDiaryContent(encryptedString: string): Promise<string> {
  if (!encryptedString) return '';
  if (!encryptedString.startsWith('ENC:')) {
    // Legacy or unencrypted
    return encryptedString;
  }

  if (!activeMasterKey) {
    return '[Locked Content - Unlock to view]';
  }

  try {
    const jsonStr = encryptedString.slice(4);
    const payload: EncryptedPayload = JSON.parse(jsonStr);
    const iv = base64ToBuffer(payload.iv);
    const ciphertext = base64ToBuffer(payload.ciphertext);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      activeMasterKey,
      ciphertext as BufferSource
    );

    return new TextDecoder().decode(decrypted);
  } catch (e) {
    console.warn('Decryption failed:', e);
    return '[Unable to decrypt with current key]';
  }
}
