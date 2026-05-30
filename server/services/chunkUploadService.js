import { getSession, updateSession } from '../store/sessionStore.js'
import { getRecordingStorage } from './storage/index.js'
import { validateChunk, resolveChunkMime } from '../utils/chunkValidator.js'
import { storageKeyForSequence } from '../utils/chunkId.js'
import { findChunkByChunkId, registerChunkRecord, listChunksForSession } from './chunkRepository.js'
import { log, logProcessingTime } from '../utils/logger.js'
import { emitChunkUploaded } from './realtimeEvents.js'
import { enqueueMerge } from '../queues/audioMergeQueue.js'

function buildSuccessResponse({
  duplicate,
  sessionId,
  chunkId,
  sequenceNumber,
  timestamp,
  storageKey,
  storagePath,
  size,
  session,
}) {
  return {
    ok: true,
    success: true,
    duplicate,
    sessionId,
    chunkId,
    sequenceNumber,
    chunkIndex: sequenceNumber,
    timestamp: timestamp instanceof Date ? timestamp.toISOString() : timestamp,
    key: storageKey,
    path: storagePath,
    size,
    session,
  }
}

/**
 * Persist a single media chunk with idempotent duplicate protection by chunkId.
 */
export async function processChunkUpload({
  sessionId,
  chunkId,
  sequenceNumber,
  timestamp,
  buffer,
  mimeType,
  filename = '',
}) {
  const session = await getSession(sessionId)
  if (!session) {
    const err = new Error('Session not found')
    err.status = 404
    throw err
  }

  const ts = timestamp instanceof Date ? timestamp : new Date(timestamp)
  const storageKey = storageKeyForSequence(sequenceNumber)

  const existing = await findChunkByChunkId(sessionId, chunkId)
  if (existing) {
    log('info', 'Duplicate chunk detected — skipping storage', {
      sessionId,
      chunkId,
      sequenceNumber,
      existingSequence: existing.sequenceNumber,
      storageKey: existing.storageKey ?? storageKey,
    })

    return buildSuccessResponse({
      duplicate: true,
      sessionId,
      chunkId,
      sequenceNumber,
      timestamp: existing.timestamp ?? ts,
      storageKey: existing.storageKey ?? storageKey,
      storagePath: existing.storagePath,
      size: existing.size ?? 0,
      session,
    })
  }

  const resolvedMime = resolveChunkMime(mimeType, filename)
  const validation = validateChunk(buffer, resolvedMime, filename)
  if (!validation.valid) {
    const err = new Error(validation.reason ?? 'Invalid chunk')
    err.status = 400
    err.details = validation
    log('warn', 'Chunk validation failed', {
      sessionId,
      chunkId,
      sequenceNumber,
      ...validation,
    })
    throw err
  }

  let stored
  const uploadStarted = Date.now()
  try {
    stored = await getRecordingStorage().uploadChunk({
      sessionId,
      sequenceNumber,
      buffer,
      mimeType: resolvedMime,
    })
  } catch (err) {
    log('error', 'Storage upload failed', {
      sessionId,
      chunkId,
      sequenceNumber,
      error: err.message,
      code: err.code,
    })
    const storageErr = new Error(
      err.code === 'STORAGE_UPLOAD_FAILED'
        ? err.message
        : 'Failed to store recording chunk'
    )
    storageErr.status = err.status ?? 503
    throw storageErr
  }
  const { key, path, cloudKey, duplicate: fileDuplicate } = stored

  if (fileDuplicate) {
    log('info', 'Chunk file already on disk — registering metadata only if missing', {
      sessionId,
      chunkId,
      sequenceNumber,
      storageKey: key,
    })
  }

  let record
  try {
    record = await registerChunkRecord({
      sessionId,
      chunkId,
      sequenceNumber,
      timestamp: ts,
      storageKey: key,
      storagePath: path,
      cloudStorageKey: cloudKey,
      size: validation.size,
      mimeType: resolvedMime || mimeType || '',
    })
  } catch (err) {
    if (err?.code === 11000) {
      log('info', 'Duplicate chunk race (unique index) — treating as success', {
        sessionId,
        chunkId,
        sequenceNumber,
      })
      const raced = await findChunkByChunkId(sessionId, chunkId)
      return buildSuccessResponse({
        duplicate: true,
        sessionId,
        chunkId,
        sequenceNumber,
        timestamp: raced?.timestamp ?? ts,
        storageKey: raced?.storageKey ?? key,
        storagePath: raced?.storagePath ?? path,
        size: raced?.size ?? validation.size,
        session,
      })
    }
    throw err
  }

  const uploadedKeys = [
    ...new Set([...(session.session_data?.uploadedChunkKeys ?? []), key]),
  ].sort()

  const updated = await updateSession(sessionId, {
    uploadedChunkKeys: uploadedKeys,
    chunkSequence: Math.max(session.session_data?.chunkSequence ?? 0, sequenceNumber + 1),
    lastChunkAt: ts.toISOString(),
    lastChunkIndex: sequenceNumber,
    chunkCount: (session.session_data?.chunkCount ?? 0) + 1,
  })

  log('info', 'Chunk uploaded', {
    sessionId,
    chunkId,
    sequenceNumber,
    storageKey: key,
    size: validation.size,
    timestamp: ts.toISOString(),
  })

  logProcessingTime('SQS.ChunkUpload', Date.now() - uploadStarted, {
    sessionId,
    sequenceNumber,
    size: validation.size,
  })

  emitChunkUploaded(sessionId, {
    chunkId,
    sequenceNumber,
    storageKey: key,
    size: validation.size,
    duplicate: false,
    chunkCount: updated?.session_data?.chunkCount ?? session.session_data?.chunkCount ?? 0,
  })

  const response = buildSuccessResponse({
    duplicate: false,
    sessionId,
    chunkId,
    sequenceNumber,
    timestamp: ts,
    storageKey: key,
    storagePath: path,
    size: validation.size,
    session: updated ?? session,
  })

  const merged = updated?.session_data ?? session.session_data ?? {}
  if (
    (merged.status === 'completed' || merged.status === 'processing') &&
    merged.mergeStatus === 'done'
  ) {
    const mergedCount = merged.mergedChunkCount ?? 0
    const records = await listChunksForSession(sessionId)
    if (records.length > mergedCount) {
      log('info', 'Late chunks arrived after merge — scheduling re-merge', {
        sessionId,
        mergedCount,
        currentCount: records.length,
      })
      enqueueMerge(sessionId, { force: true }).catch((err) => {
        log('warn', 'Re-merge scheduling failed', { sessionId, error: err.message })
      })
    }
  }

  return response
}
