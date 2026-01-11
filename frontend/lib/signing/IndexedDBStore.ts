/**
 * IndexedDB Store for encrypted signing key storage
 *
 * Keys are stored encrypted with a user-provided password using
 * PBKDF2 key derivation and AES-GCM encryption.
 */

const DB_NAME = 'essi-signing-keys';
const DB_VERSION = 1;
const STORE_NAME = 'keys';

export interface StoredKeyData {
  id: string;
  name: string;
  algorithm: string;
  createdAt: string;
  expiresAt: string;
  encryptedPrivateKey: string; // Base64 encoded encrypted JWK
  certificate: string; // PEM encoded certificate
  iv: string; // Base64 encoded IV for decryption
  salt: string; // Base64 encoded salt for key derivation
}

/**
 * Open the IndexedDB database
 */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

/**
 * Derive an encryption key from a password using PBKDF2
 */
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength) as ArrayBuffer,
      iterations: 100000,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt data with a password
 */
async function encryptData(data: string, password: string): Promise<{ encrypted: string; iv: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);

  const encoder = new TextEncoder();
  const ivBuffer = iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer;
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: ivBuffer },
    key,
    encoder.encode(data)
  );

  return {
    encrypted: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    iv: btoa(String.fromCharCode(...iv)),
    salt: btoa(String.fromCharCode(...salt)),
  };
}

/**
 * Decrypt data with a password
 */
async function decryptData(encryptedBase64: string, ivBase64: string, saltBase64: string, password: string): Promise<string> {
  const encrypted = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
  const iv = Uint8Array.from(atob(ivBase64), c => c.charCodeAt(0));
  const salt = Uint8Array.from(atob(saltBase64), c => c.charCodeAt(0));

  const key = await deriveKey(password, salt);

  const ivBuffer = iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer;
  const encryptedBuffer = encrypted.buffer.slice(encrypted.byteOffset, encrypted.byteOffset + encrypted.byteLength) as ArrayBuffer;
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBuffer },
    key,
    encryptedBuffer
  );

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

/**
 * IndexedDB Store for signing keys
 */
export const IndexedDBStore = {
  /**
   * Store an encrypted key
   */
  async saveKey(
    id: string,
    name: string,
    algorithm: string,
    privateKeyJwk: JsonWebKey,
    certificatePem: string,
    createdAt: Date,
    expiresAt: Date,
    password: string
  ): Promise<void> {
    const db = await openDatabase();

    // Encrypt the private key
    const { encrypted, iv, salt } = await encryptData(
      JSON.stringify(privateKeyJwk),
      password
    );

    const keyData: StoredKeyData = {
      id,
      name,
      algorithm,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      encryptedPrivateKey: encrypted,
      certificate: certificatePem,
      iv,
      salt,
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(keyData);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  },

  /**
   * Get all stored keys (without decrypting private keys)
   */
  async listKeys(): Promise<Omit<StoredKeyData, 'encryptedPrivateKey' | 'iv' | 'salt'>[]> {
    const db = await openDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const keys = request.result.map((k: StoredKeyData) => ({
          id: k.id,
          name: k.name,
          algorithm: k.algorithm,
          createdAt: k.createdAt,
          expiresAt: k.expiresAt,
          certificate: k.certificate,
        }));
        resolve(keys);
      };
    });
  },

  /**
   * Get a key and decrypt its private key
   */
  async getKey(id: string, password: string): Promise<{ privateKeyJwk: JsonWebKey; certificate: string; name: string; algorithm: string } | null> {
    const db = await openDatabase();

    return new Promise(async (resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = async () => {
        const keyData = request.result as StoredKeyData | undefined;
        if (!keyData) {
          resolve(null);
          return;
        }

        try {
          const decryptedJwk = await decryptData(
            keyData.encryptedPrivateKey,
            keyData.iv,
            keyData.salt,
            password
          );

          resolve({
            privateKeyJwk: JSON.parse(decryptedJwk),
            certificate: keyData.certificate,
            name: keyData.name,
            algorithm: keyData.algorithm,
          });
        } catch {
          reject(new Error('Invalid password or corrupted key data'));
        }
      };
    });
  },

  /**
   * Delete a key
   */
  async deleteKey(id: string): Promise<void> {
    const db = await openDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  },

  /**
   * Check if any keys exist
   */
  async hasKeys(): Promise<boolean> {
    const keys = await this.listKeys();
    return keys.length > 0;
  },

  /**
   * Clear all keys (for logout)
   */
  async clearAll(): Promise<void> {
    const db = await openDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  },
};
