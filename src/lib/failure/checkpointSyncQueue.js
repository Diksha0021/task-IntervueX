import { patchSession } from '../interview/api.js'
import { logFailure, logWarning } from './failureLogger.js'
import { getUserMessage } from './userMessages.js'

/**
 * Queues failed session checkpoints and retries when the API is reachable.
 */
export function createCheckpointSyncQueue() {
  /** @type {Array<{ sessionId: string, patch: object, attempts: number }>} */
  const queue = []
  let flushing = false

  function enqueue(sessionId, patch) {
    const existing = queue.find((q) => q.sessionId === sessionId)
    if (existing) {
      existing.patch = { ...existing.patch, ...patch }
      existing.attempts = 0
    } else {
      queue.push({ sessionId, patch, attempts: 0 })
    }
  }

  async function flush() {
    if (flushing || queue.length === 0) return { synced: 0, failed: 0 }
    flushing = true
    let synced = 0
    let failed = 0

    const pending = [...queue]
    for (const item of pending) {
      try {
        await patchSession(item.sessionId, item.patch)
        const idx = queue.findIndex((q) => q.sessionId === item.sessionId)
        if (idx >= 0) queue.splice(idx, 1)
        synced += 1
      } catch (err) {
        item.attempts += 1
        failed += 1
        if (item.attempts >= 5) {
          logFailure('checkpoint_sync', getUserMessage('api_unreachable'), {
            sessionId: item.sessionId,
            attempts: item.attempts,
            error: err.message,
          })
        } else {
          logWarning('checkpoint_sync', 'Checkpoint sync retry scheduled', {
            sessionId: item.sessionId,
            attempts: item.attempts,
          })
        }
      }
    }

    flushing = false
    return { synced, failed, pending: queue.length }
  }

  function getPendingCount() {
    return queue.length
  }

  return { enqueue, flush, getPendingCount }
}
