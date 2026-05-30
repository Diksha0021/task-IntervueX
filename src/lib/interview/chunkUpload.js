import { getToken } from '../auth/api.js'
import { logFailure } from '../failure/failureLogger.js'

const API_BASE = import.meta.env.VITE_API_URL ?? ''

export function buildChunkId(sessionId, sequenceNumber, timestamp) {
  return `${sessionId}-${String(sequenceNumber).padStart(6, '0')}-${new Date(timestamp).getTime()}`
}

function isOfflineError(err) {
  if (!navigator.onLine) return true
  const msg = err?.message?.toLowerCase() ?? ''
  return msg.includes('offline') || msg.includes('failed to fetch') || msg.includes('network')
}

/**
 * Single upload attempt — retries handled by chunkUploadQueue with exponential backoff.
 */
export async function uploadChunkOnce({
  sessionId,
  sequenceNumber,
  chunkIndex,
  chunkId,
  blob,
  timestamp = Date.now(),
}) {
  if (!navigator.onLine) {
    const err = new Error('offline')
    err.offline = true
    throw err
  }

  const seq = sequenceNumber ?? chunkIndex
  if (seq == null || Number.isNaN(seq)) {
    throw new Error('sequenceNumber is required')
  }

  const ts = new Date(timestamp)
  const resolvedChunkId = chunkId ?? buildChunkId(sessionId, seq, ts)

  const filename = `chunk_${String(seq).padStart(3, '0')}.webm`
  const payload = new Blob([blob], { type: 'video/webm' })

  const form = new FormData()
  form.append('chunk', payload, filename)
  form.append('sessionId', sessionId)
  form.append('chunkId', resolvedChunkId)
  form.append('sequenceNumber', String(seq))
  form.append('chunkIndex', String(seq))
  form.append('timestamp', ts.toISOString())

  const token = getToken()
  const headers = {
    'X-Chunk-Id': resolvedChunkId,
    'X-Chunk-Index': String(seq),
    'X-Chunk-Timestamp': ts.toISOString(),
  }
  if (token) headers.Authorization = `Bearer ${token}`

  try {
    const res = await fetch(`${API_BASE}/api/chunks/upload`, {
      method: 'POST',
      body: form,
      headers,
    })

    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      const reason = data.reason ?? data.error
      const uploadErr = new Error(reason ?? `Upload failed (${res.status})`)
      uploadErr.status = res.status
      uploadErr.transient = res.status >= 500 || res.status === 429
      logFailure('chunk_upload', uploadErr.message, {
        sessionId,
        sequenceNumber: seq,
        status: res.status,
        chunkId: resolvedChunkId,
      })
      throw uploadErr
    }

    return data
  } catch (err) {
    if (isOfflineError(err)) {
      const offlineErr = new Error('offline')
      offlineErr.offline = true
      throw offlineErr
    }
    if (!err.status) {
      err.transient = true
    }
    throw err
  }
}

/** @deprecated Use uploadChunkOnce via chunkUploadQueue */
export async function uploadChunkStream(payload) {
  return uploadChunkOnce(payload)
}
