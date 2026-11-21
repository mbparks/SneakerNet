/**
 * One atomic IndexedDB snapshot per installation directory.
 * App assets and exported mail are deliberately not stored in this database.
 */
import { validateDrafts, assertDeskCapacity } from './core.js';

const installationPath = new URL('../', import.meta.url).pathname;
const databaseName = `sneakernet-social-club:${installationPath}`;
const storeName = 'snapshots';
const recordKey = 'desk';
let opening;
let channel;
const listeners = new Set();

export class DeskStorageError extends Error {
  constructor(message, code, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'DeskStorageError';
    this.code = code;
  }
}

function storageError(error) {
  if (error instanceof DeskStorageError) return error;
  if (error?.name === 'QuotaExceededError') {
    return new DeskStorageError('This browser has run out of space for the desk. Download a full-desk backup before freeing browser storage, then try saving again. Your existing saved desk was not replaced.', 'QUOTA', error);
  }
  if (error?.name === 'SecurityError' || error?.name === 'NotAllowedError') {
    return new DeskStorageError('This browser is blocking local storage. Allow site data for this address, or use a normal browser window. Download a full-desk backup of any unsaved work before closing.', 'BLOCKED', error);
  }
  return new DeskStorageError('The desk could not be saved or read from this browser. Keep this window open, download a full-desk backup if available, and try again. Existing saved mail has not been deliberately cleared.', 'STORAGE', error);
}

function openDatabase() {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new DeskStorageError('Local storage is unavailable in this browser. Open the app in a browser that supports IndexedDB before writing or accepting mail.', 'UNAVAILABLE'));
      return;
    }
    let settled = false;
    let request;
    try {
      request = indexedDB.open(databaseName, 1);
    } catch (error) {
      reject(storageError(error));
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName);
    };
    request.onblocked = () => {
      settled = true;
      reject(new DeskStorageError('Another tab is holding an older copy of this desk open. Close the other Sneakernet tabs, then reload this one. No saved mail was cleared.', 'BLOCKED'));
    };
    request.onerror = () => {
      settled = true;
      reject(storageError(request.error));
    };
    request.onsuccess = () => {
      const db = request.result;
      if (settled) { db.close(); return; }
      settled = true;
      db.onversionchange = () => { db.close(); opening = undefined; };
      db.onclose = () => { opening = undefined; };
      resolve(db);
    };
  }).catch(error => { opening = undefined; throw error; });
  return opening;
}

function validRecord(record) {
  if (record === undefined) return { desk: null, revision: 0 };
  if (!record || typeof record !== 'object' || !Number.isSafeInteger(record.revision) || record.revision < 1 || !record.desk || typeof record.desk !== 'object' || Array.isArray(record.desk)) {
    throw new DeskStorageError('The saved desk has an unreadable storage record. It has been left in place. Restore a known backup in a separate installation, or keep this browser profile for recovery; do not clear site data.', 'CORRUPT');
  }
  return { desk: record.desk, revision: record.revision };
}

export async function loadDesk() {
  try {
    const db = await openDatabase();
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const request = transaction.objectStore(storeName).get(recordKey);
      let result;
      let failure;
      request.onsuccess = () => {
        try { result = validRecord(request.result); }
        catch (error) { failure = error; transaction.abort(); }
      };
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(failure || storageError(transaction.error));
      transaction.onerror = () => { /* onabort owns the final result. */ };
    });
  } catch (error) { throw storageError(error); }
}

function checkRevision(expectedRevision) {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw new DeskStorageError('The desk revision is missing. Reload the saved desk before saving again.', 'REVISION');
  }
}

// Read/check/write is one transaction. Both whole-desk changes and small draft
// patches share this gate, so neither can overwrite a more recent tab's save.
async function writeSnapshot(expectedRevision, buildSnapshot) {
  try {
    const db = await openDatabase();
    const revision = await new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.get(recordKey);
      let nextRevision;
      let failure;
      request.onsuccess = () => {
        try {
          const current = validRecord(request.result);
          if (current.revision !== expectedRevision) {
            throw new DeskStorageError('This desk changed in another tab. Save a backup of this window’s work, then reload to use the newest saved desk. This save was stopped so neither copy is silently overwritten.', 'CONFLICT');
          }
          if (current.revision >= Number.MAX_SAFE_INTEGER) {
            throw new DeskStorageError('This desk has reached its supported save counter. Download a full-desk backup before moving it to a new installation.', 'REVISION');
          }
          nextRevision = current.revision + 1;
          const snapshot = buildSnapshot(current.desk);
          store.put({ revision: nextRevision, desk: snapshot }, recordKey);
        } catch (error) {
          failure = error;
          transaction.abort();
        }
      };
      transaction.oncomplete = () => resolve(nextRevision);
      transaction.onabort = () => reject(failure || storageError(transaction.error));
      transaction.onerror = () => { /* onabort owns the final result. */ };
    });
    try { getChannel()?.postMessage({ type: 'desk-saved', revision }); } catch { /* Notifications are optional; revision checks remain authoritative. */ }
    return { revision };
  } catch (error) { throw storageError(error); }
}

export async function saveDesk(desk, expectedRevision) {
  checkRevision(expectedRevision);
  if (!desk || typeof desk !== 'object' || Array.isArray(desk)) {
    throw new DeskStorageError('A complete desk is required to save. The existing saved desk was not changed.', 'INVALID');
  }
  try {
    // Capture callers' state before yielding to IndexedDB's asynchronous open.
    const snapshot = structuredClone(desk);
    return await writeSnapshot(expectedRevision, () => snapshot);
  } catch (error) { throw storageError(error); }
}

/**
 * Save a private draft without revalidating and replacing the mail graph.
 * Boot must first persist a new or migrated schema-4 desk with saveDesk.
 * The stored snapshot is read inside the write transaction; only drafts change.
 */
export async function saveDrafts(drafts, expectedRevision) {
  checkRevision(expectedRevision);
  let snapshot;
  try { snapshot = validateDrafts(drafts); }
  catch (error) {
    throw new DeskStorageError(`These private drafts could not be saved: ${error.message}`, 'INVALID', error);
  }
  return writeSnapshot(expectedRevision, current => {
    if (!current || current.schemaVersion !== 4) {
      throw new DeskStorageError('This desk has not finished opening or upgrading. Keep the draft in this window and retry after the desk is ready.', 'NOT_READY');
    }
    const patched = { ...current, drafts: snapshot };
    try { assertDeskCapacity(patched); }
    catch (error) {
      throw new DeskStorageError(`The draft would make this desk too large to back up. Keep a copy of the draft before shortening it. ${error.message}`, 'CAPACITY', error);
    }
    return patched;
  });
}

function getChannel() {
  if (channel || !globalThis.BroadcastChannel) return channel;
  try {
    channel = new BroadcastChannel(databaseName);
    channel.onmessage = event => {
      if (event.data?.type !== 'desk-saved' || !Number.isSafeInteger(event.data.revision)) return;
      for (const listener of listeners) {
        try { listener({ revision: event.data.revision }); } catch { /* One subscriber cannot stop the others. */ }
      }
    };
  } catch { channel = undefined; }
  return channel;
}

export function subscribeChanges(callback) {
  if (typeof callback !== 'function') throw new TypeError('A change callback is required.');
  listeners.add(callback);
  getChannel();
  return () => listeners.delete(callback);
}

/** Ask only from a user action; browser permission decisions are not promises. */
export async function requestPersistence() {
  try {
    if (!globalThis.navigator?.storage) return null;
    if (await navigator.storage.persisted?.()) return true;
    if (!navigator.storage.persist) return null;
    return await navigator.storage.persist();
  } catch { return null; }
}
