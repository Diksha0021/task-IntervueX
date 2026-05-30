import { uploadChunkOnce, buildChunkId } from './chunkUpload.js'
import { logFailure, logWarning } from '../failure/failureLogger.js'
import { getUserMessage } from '../failure/userMessages.js'
import {
  savePendingChunk,
  loadPendingChunksForSession,
  removePendingChunk,
  listManifestEntries,
} from './chunkPendingStorage.js'

export const SYNC_STATUS = {
  SYNCED: 'synced',
  UPLOADING: 'uploading',
  OFFLINE: 'offline',
  RETRYING: 'retrying',
}

/** Faster backoff for transient failures */
export const BACKOFF_MS = [400, 800, 1600, 3200]

/** Parallel upload workers — dramatically reduces backlog during long interviews */
export const MAX_CONCURRENT_UPLOADS = 4

let globalOnline = typeof navigator !== 'undefined' ? navigator.onLine : true
const onlineListeners = new Set()

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    globalOnline = true
    onlineListeners.forEach((fn) => fn(true))
  })
  window.addEventListener('offline', () => {
    globalOnline = false
    onlineListeners.forEach((fn) => fn(false))
  })
}

export function isBrowserOnline() {
  return globalOnline
}

export function subscribeNetworkStatus(listener) {
  onlineListeners.add(listener)
  return () => onlineListeners.delete(listener)
}

function backoffDelay(attempts) {
  const idx = Math.min(Math.max(attempts, 0), BACKOFF_MS.length - 1)
  return BACKOFF_MS[idx]
}

function makeId(sessionId, sequenceNumber, timestamp) {
  return `${sessionId}::${sequenceNumber}::${timestamp}`
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Per-session upload queue with parallel workers, persistent storage, and network recovery.
 */
export function createChunkUploadQueue(sessionId, onEvent) {
  /** @type {Map<string, object>} */
  const memoryQueue = new Map()
  let draining = false
  let activeUploads = 0
  let isRetrying = false
  let uploadedCount = 0
  let failedCount = 0
  let retryCount = 0
  const stalledIds = new Set()
  const completedChunkIds = new Set()

  function emit(type, extra = {}) {
    onEvent?.({
      type,
      sessionId,
      pending: getPendingCount(),
      syncStatus: getSyncStatus(),
      isOnline: globalOnline,
      uploaded: uploadedCount,
      failed: failedCount,
      retries: retryCount,
      activeUploads,
      ...extra,
    })
  }

  function getPendingCount() {
    return memoryQueue.size
  }

  function getSyncStatus() {
    if (!globalOnline) return SYNC_STATUS.OFFLINE
    if (activeUploads > 0) return SYNC_STATUS.UPLOADING
    if (isRetrying || getPendingCount() > 0) {
      return isRetrying ? SYNC_STATUS.RETRYING : SYNC_STATUS.UPLOADING
    }
    return SYNC_STATUS.SYNCED
  }

  async function persistItem(item) {
    await savePendingChunk({
      id: item.id,
      sessionId: item.sessionId,
      chunkId: item.chunkId,
      sequenceNumber: item.sequenceNumber,
      timestamp: item.timestamp,
      blob: item.blob,
      attempts: item.attempts,
      addedAt: item.addedAt,
    })
  }

  async function enqueue(item) {
    const { blob, sequenceNumber, timestamp } = item
    const chunkId = item.chunkId ?? buildChunkId(sessionId, sequenceNumber, timestamp)
    const id = makeId(sessionId, sequenceNumber, timestamp)

    if (completedChunkIds.has(chunkId)) {
      logWarning('chunk_upload', getUserMessage('chunk_duplicate_skipped'), { sessionId, chunkId })
      emit('chunk_skipped', { chunkId, reason: 'already_uploaded' })
      return
    }

    if (memoryQueue.has(id)) {
      emit('chunk_skipped', { chunkId, reason: 'already_queued' })
      return
    }

    const entry = {
      id,
      sessionId,
      chunkId,
      sequenceNumber,
      timestamp,
      blob,
      attempts: item.attempts ?? 0,
      addedAt: item.addedAt ?? Date.now(),
    }

    memoryQueue.set(id, entry)
    persistItem(entry).catch((err) => {
      logFailure('chunk_persist', 'Failed to persist chunk locally', {
        sessionId,
        chunkId,
        error: err.message,
        severity: 'warn',
      })
    })

    emit('queue_updated')
    scheduleDrain()
  }

  function scheduleDrain() {
    if (!draining) {
      drain().catch((err) => {
        console.warn('Chunk queue drain error', err)
      })
    }
  }

  async function takeNext() {
    const next = memoryQueue.entries().next()
    if (next.done) return null
    const [id, item] = next.value
    memoryQueue.delete(id)
    return item
  }

  async function processOne(item) {
    activeUploads += 1
    emit('upload_started', { chunkIndex: item.sequenceNumber, chunkId: item.chunkId })

    try {
      const result = await uploadChunkOnce({
        sessionId: item.sessionId,
        sequenceNumber: item.sequenceNumber,
        chunkId: item.chunkId,
        blob: item.blob,
        timestamp: item.timestamp,
      })

      await removePendingChunk(item.id).catch(() => {})
      completedChunkIds.add(item.chunkId)
      stalledIds.delete(item.id)
      uploadedCount += 1

      if (result.duplicate) {
        logWarning('chunk_upload', getUserMessage('chunk_duplicate_skipped'), {
          sessionId,
          chunkId: item.chunkId,
        })
      }

      emit('chunk_uploaded', {
        chunkIndex: item.sequenceNumber,
        chunkId: item.chunkId,
        duplicate: result.duplicate,
        size: item.blob.size,
      })
    } catch (err) {
      item.attempts += 1
      retryCount += 1
      memoryQueue.set(item.id, item)
      persistItem(item).catch(() => {})

      const delay = backoffDelay(item.attempts - 1)
      isRetrying = true

      emit('chunk_retry', {
        chunkIndex: item.sequenceNumber,
        chunkId: item.chunkId,
        attempts: item.attempts,
        delayMs: delay,
        error: err.message,
        offline: err.offline ?? !globalOnline,
      })

      if (item.attempts >= BACKOFF_MS.length && !stalledIds.has(item.id)) {
        stalledIds.add(item.id)
        failedCount += 1
        logFailure('chunk_upload', getUserMessage('chunk_upload_failed'), {
          sessionId,
          chunkId: item.chunkId,
          sequenceNumber: item.sequenceNumber,
          attempts: item.attempts,
          error: err.message,
        })
        emit('chunk_failed', {
          chunkIndex: item.sequenceNumber,
          chunkId: item.chunkId,
          attempts: item.attempts,
          error: err.message,
          persisted: true,
        })
      }

      if (globalOnline && item.attempts < BACKOFF_MS.length + 2) {
        await sleep(delay)
      }
    } finally {
      activeUploads -= 1
      isRetrying = activeUploads > 0 || memoryQueue.size > 0
    }
  }

  async function workerLoop() {
    while (globalOnline) {
      const item = await takeNext()
      if (!item) break
      await processOne(item)
    }
  }

  async function drain() {
    if (draining) return
    draining = true

    try {
      while (globalOnline && (memoryQueue.size > 0 || activeUploads > 0)) {
        const workers = Math.min(
          MAX_CONCURRENT_UPLOADS,
          memoryQueue.size || 1
        )

        if (memoryQueue.size === 0) {
          if (activeUploads > 0) await sleep(100)
          else break
          continue
        }

        const batch = []
        for (let i = 0; i < workers && memoryQueue.size > 0; i++) {
          batch.push(workerLoop())
        }
        await Promise.all(batch)
      }

      if (!globalOnline && memoryQueue.size > 0) {
        emit('network_offline')
      }
    } finally {
      draining = false
      emit('queue_updated')
      emit('drain_complete')
    }
  }

  async function restoreFromStorage() {
    const stored = await loadPendingChunksForSession(sessionId)
    for (const record of stored) {
      memoryQueue.set(record.id, record)
    }
    if (stored.length > 0) {
      emit('queue_restored', { count: stored.length })
      scheduleDrain()
    }
    return stored.length
  }

  async function flush() {
    if (globalOnline) {
      await drain()
    }
  }

  async function flushAndWait(timeoutMs = 120000) {
    scheduleDrain()
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      if (memoryQueue.size === 0 && activeUploads === 0) {
        return { ok: true, uploaded: uploadedCount, pending: 0 }
      }
      scheduleDrain()
      await sleep(250)
    }
    return {
      ok: false,
      uploaded: uploadedCount,
      pending: memoryQueue.size + activeUploads,
    }
  }

  function retryFailed() {
    for (const item of memoryQueue.values()) {
      item.attempts = 0
      stalledIds.delete(item.id)
    }
    failedCount = 0
    emit('retry_requested', { pending: memoryQueue.size })
    scheduleDrain()
  }

  const unsubNetwork = subscribeNetworkStatus((online) => {
    emit(online ? 'network_online' : 'network_offline')
    if (online) scheduleDrain()
  })

  restoreFromStorage().catch((err) => {
    logFailure('chunk_restore', 'Failed to restore pending chunks from device storage', {
      sessionId,
      error: err.message,
    })
  })

  return {
    enqueue,
    flush,
    flushAndWait,
    retryFailed,
    restoreFromStorage,
    getPendingCount,
    getSyncStatus,
    isOnline: () => globalOnline,
    uploadedCount: () => uploadedCount,
    failedCount: () => failedCount,
    destroy: () => {
      unsubNetwork()
      memoryQueue.clear()
    },
  }
}

export function getGlobalPendingCount() {
  return listManifestEntries().length
}
