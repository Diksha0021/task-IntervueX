/**
 * Persistent pending chunk store.
 * - Metadata manifest in localStorage (survives refresh, fast listing)
 * - Blob payloads in IndexedDB (required for WebM binary data)
 */

const DB_NAME = 'intervuex-chunk-pending'
const DB_VERSION = 1
const STORE_NAME = 'chunks'
const MANIFEST_KEY = 'intervuex_pending_chunk_manifest'

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function readManifest() {
  try {
    const raw = localStorage.getItem(MANIFEST_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function writeManifest(entries) {
  try {
    localStorage.setItem(MANIFEST_KEY, JSON.stringify(entries))
  } catch (err) {
    console.warn('Could not persist chunk manifest to localStorage', err)
  }
}

export function listManifestEntries(sessionId = null) {
  const all = readManifest()
  if (!sessionId) return all
  return all.filter((e) => e.sessionId === sessionId)
}

/**
 * @param {object} entry
 * @param {string} entry.id
 * @param {string} entry.sessionId
 * @param {string} entry.chunkId
 * @param {number} entry.sequenceNumber
 * @param {number} entry.timestamp
 * @param {Blob} entry.blob
 */
export async function savePendingChunk(entry) {
  const db = await openDatabase()
  const record = {
    id: entry.id,
    sessionId: entry.sessionId,
    chunkId: entry.chunkId,
    sequenceNumber: entry.sequenceNumber,
    timestamp: entry.timestamp,
    size: entry.blob?.size ?? 0,
    blob: entry.blob,
    attempts: entry.attempts ?? 0,
    addedAt: entry.addedAt ?? Date.now(),
  }

  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(record)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })

  const manifest = readManifest().filter((e) => e.id !== record.id)
  manifest.push({
    id: record.id,
    sessionId: record.sessionId,
    chunkId: record.chunkId,
    sequenceNumber: record.sequenceNumber,
    timestamp: record.timestamp,
    size: record.size,
    attempts: record.attempts,
    addedAt: record.addedAt,
  })
  writeManifest(manifest)
  db.close()

  return record
}

export async function loadPendingChunk(id) {
  const db = await openDatabase()
  const record = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get(id)
    req.onsuccess = () => resolve(req.result ?? null)
    req.onerror = () => reject(req.error)
  })
  db.close()
  return record
}

export async function removePendingChunk(id) {
  const db = await openDatabase()
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()

  writeManifest(readManifest().filter((e) => e.id !== id))
}

export async function loadPendingChunksForSession(sessionId) {
  if (!sessionId) return []
  const entries = listManifestEntries(sessionId)
  const chunks = []
  for (const meta of entries) {
    const full = await loadPendingChunk(meta.id)
    if (full?.blob) chunks.push(full)
  }
  return chunks.sort((a, b) => a.sequenceNumber - b.sequenceNumber)
}

export async function clearPendingForSession(sessionId) {
  const entries = listManifestEntries(sessionId)
  for (const e of entries) {
    await removePendingChunk(e.id)
  }
}
