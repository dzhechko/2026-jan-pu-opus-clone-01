/**
 * BYOK Vault -- Client-side encrypted key storage
 *
 * Uses Web Crypto API (AES-GCM 256-bit) + IndexedDB.
 * Master key derived from user password via PBKDF2 (100K iterations).
 * Auto-locks after 30 minutes of inactivity.
 *
 * SECURITY: Master key exists ONLY in memory (closure).
 * Server NEVER receives or stores plaintext keys persistently.
 */

import type { ByokProvider, EncryptedByokKey } from '@clipmaker/types';

const DB_NAME = 'clipmaker-byok';
const DB_VERSION = 1;
const KEYS_STORE = 'keys';
const META_STORE = 'meta';

const PBKDF2_ITERATIONS = 100_000;
const AUTO_LOCK_MS = 30 * 60 * 1000; // 30 minutes

// --- Vault State (closure -- NOT on window/global) ---

let masterKey: CryptoKey | null = null;
let autoLockTimerId: ReturnType<typeof setTimeout> | null = null;
let onLockCallback: (() => void) | null = null;
let activityListenersAttached = false;

// --- IndexedDB Helpers ---

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(KEYS_STORE)) {
        db.createObjectStore(KEYS_STORE, { keyPath: 'provider' });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Failed to open IndexedDB'));
  });
}

function idbGet<T>(storeName: string, key: string): Promise<T | undefined> {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await openDB();
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () => reject(new Error('IndexedDB get failed'));
      tx.oncomplete = () => db.close();
    } catch (err) {
      reject(err);
    }
  });
}

function idbPut(storeName: string, value: unknown): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await openDB();
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.put(value);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(new Error('IndexedDB put failed'));
    } catch (err) {
      reject(err);
    }
  });
}

function idbDelete(storeName: string, key: string): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await openDB();
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.delete(key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(new Error('IndexedDB delete failed'));
    } catch (err) {
      reject(err);
    }
  });
}

function idbGetAll<T>(storeName: string): Promise<T[]> {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await openDB();
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result as T[]);
      request.onerror = () => reject(new Error('IndexedDB getAll failed'));
      tx.oncomplete = () => db.close();
    } catch (err) {
      reject(err);
    }
  });
}

// --- Salt Management ---

async function getSalt(): Promise<Uint8Array | null> {
  const meta = await idbGet<{ id: string; value: number[] }>(META_STORE, 'salt');
  if (!meta) return null;
  return new Uint8Array(meta.value);
}

async function storeSalt(salt: Uint8Array): Promise<void> {
  await idbPut(META_STORE, { id: 'salt', value: Array.from(salt) });
}

// --- Auto-Lock Timer ---

function resetAutoLockTimer(): void {
  if (autoLockTimerId !== null) {
    clearTimeout(autoLockTimerId);
  }
  autoLockTimerId = setTimeout(() => {
    lockVault();
  }, AUTO_LOCK_MS);
}

function setupActivityListeners(): void {
  // Prevent duplicate listeners on repeated unlock calls
  if (activityListenersAttached) return;
  activityListenersAttached = true;

  const events = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'];
  const handler = () => {
    if (masterKey !== null) {
      resetAutoLockTimer();
    }
  };
  for (const event of events) {
    document.addEventListener(event, handler, { passive: true });
  }

  // Handle visibility change -- check if we should already be locked
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && masterKey !== null) {
      resetAutoLockTimer();
    }
  });
}

// --- Core Vault Operations ---

/**
 * Check if Web Crypto API is available (requires HTTPS).
 */
export function isVaultAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof crypto !== 'undefined' &&
    typeof crypto.subtle !== 'undefined' &&
    typeof indexedDB !== 'undefined'
  );
}

/**
 * Check if the vault is currently unlocked (master key in memory).
 */
export function isVaultUnlocked(): boolean {
  return masterKey !== null;
}

/**
 * Register a callback to be called when the vault auto-locks.
 */
export function onVaultLock(callback: () => void): void {
  onLockCallback = callback;
}

/**
 * Derive master key from password using PBKDF2 and unlock the vault.
 * If no salt exists, creates a new one (first-time setup).
 */
export async function unlockVault(password: string): Promise<void> {
  if (!isVaultAvailable()) {
    throw new Error('BYOK vault requires HTTPS and a modern browser');
  }

  let salt = await getSalt();
  if (!salt) {
    salt = crypto.getRandomValues(new Uint8Array(16));
    await storeSalt(salt);
  }

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  masterKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false, // not extractable
    ['encrypt', 'decrypt'],
  );

  resetAutoLockTimer();
  setupActivityListeners();
}

/**
 * Lock the vault -- clear master key from memory.
 */
export function lockVault(): void {
  masterKey = null;
  if (autoLockTimerId !== null) {
    clearTimeout(autoLockTimerId);
    autoLockTimerId = null;
  }
  onLockCallback?.();
}

/**
 * Encrypt an API key and store it in IndexedDB.
 */
export async function storeKey(provider: ByokProvider, apiKey: string): Promise<void> {
  if (!masterKey) {
    throw new Error('Vault is locked. Unlock with password first.');
  }

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintextBytes = new TextEncoder().encode(apiKey);

  const encryptedData = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    masterKey,
    plaintextBytes,
  );

  const keyPreview =
    apiKey.length > 8
      ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`
      : '****';

  const salt = await getSalt();
  if (!salt) throw new Error('Salt not found');

  const entry: EncryptedByokKey & { provider: ByokProvider } = {
    provider,
    encryptedData: Array.from(new Uint8Array(encryptedData)) as unknown as ArrayBuffer,
    iv: Array.from(iv) as unknown as Uint8Array,
    salt: Array.from(salt) as unknown as Uint8Array,
    createdAt: Date.now(),
    keyPreview,
  };

  await idbPut(KEYS_STORE, entry);
}

/**
 * Decrypt and return an API key from IndexedDB.
 */
export async function getKey(provider: ByokProvider): Promise<string | null> {
  if (!masterKey) {
    throw new Error('Vault is locked. Unlock with password first.');
  }

  const entry = await idbGet<{
    provider: ByokProvider;
    encryptedData: number[];
    iv: number[];
    keyPreview: string;
    createdAt: number;
  }>(KEYS_STORE, provider);

  if (!entry) return null;

  try {
    const decryptedBytes = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(entry.iv) },
      masterKey,
      new Uint8Array(entry.encryptedData),
    );

    return new TextDecoder().decode(decryptedBytes);
  } catch {
    // Decryption failed -- likely wrong password or corrupted data
    throw new Error('Decryption failed. Wrong password or corrupted data.');
  }
}

/**
 * Delete an encrypted key from IndexedDB.
 */
export async function deleteKey(provider: ByokProvider): Promise<void> {
  await idbDelete(KEYS_STORE, provider);
}

/**
 * Get all stored keys (encrypted metadata only -- no decryption).
 */
export async function getAllKeysMeta(): Promise<
  Array<{ provider: ByokProvider; keyPreview: string; createdAt: number }>
> {
  const entries = await idbGetAll<{
    provider: ByokProvider;
    keyPreview: string;
    createdAt: number;
  }>(KEYS_STORE);

  return entries.map((e) => ({
    provider: e.provider,
    keyPreview: e.keyPreview,
    createdAt: e.createdAt,
  }));
}

/**
 * Decrypt all stored keys and return as a map.
 * Used before triggering video processing to cache keys on server.
 */
export async function getAllDecryptedKeys(): Promise<Partial<Record<ByokProvider, string>>> {
  if (!masterKey) {
    throw new Error('Vault is locked. Unlock with password first.');
  }

  const meta = await getAllKeysMeta();
  const result: Partial<Record<ByokProvider, string>> = {};

  for (const entry of meta) {
    try {
      const key = await getKey(entry.provider);
      if (key) {
        result[entry.provider] = key;
      }
    } catch {
      // Skip keys that fail to decrypt
    }
  }

  return result;
}

/**
 * Check if any BYOK keys are stored (without decryption).
 */
export async function hasStoredKeys(): Promise<boolean> {
  const meta = await getAllKeysMeta();
  return meta.length > 0;
}
