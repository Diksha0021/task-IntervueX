import { getSession, updateSession } from '../../store/sessionStore.js'
import { listChunksForSession } from '../chunkRepository.js'
import * as chunkStore from '../../store/chunkStore.js'
import { env } from '../../config/env.js'
import { log, logProcessingTime } from '../../utils/logger.js'
import { emitTranscriptionProgress } from '../realtimeEvents.js'
import { LocalStorageAdapter } from './adapters/localAdapter.js'
import { S3StorageAdapter } from './adapters/s3Adapter.js'
import { waitForUploadedChunks } from './waitForChunks.js'

function createAdapter() {
  if (env.storageProvider === 's3' && env.s3.bucket) {
    return new S3StorageAdapter()
  }
  return new LocalStorageAdapter()
}

let instance = null

export function getRecordingStorage() {
  if (!instance) {
    instance = new RecordingStorageService(createAdapter())
  }
  return instance
}

export function resolvePublicRecordingUrl(session) {
  const sd = session?.session_data ?? {}
  const sessionId = session?.id ?? session?.sessionId
  const raw = sd.recordingUrl ?? session?.recordingUrl ?? null

  if (raw?.startsWith('http://') || raw?.startsWith('https://')) return raw
  if (raw?.startsWith('/')) return raw

  const hasChunks =
    (sd.chunkCount ?? 0) > 0 ||
    (sd.uploadedChunkKeys?.length ?? 0) > 0 ||
    sd.mergeStatus === 'done'

  if (sessionId && (raw || hasChunks)) {
    return `/api/recordings/${sessionId}/video`
  }

  return null
}

export class RecordingStorageService {
  constructor(adapter) {
    this.adapter = adapter
  }

  /** @returns {Promise<{ key: string, path: string, cloudKey: string, duplicate: boolean, size: number }>} */
  async uploadChunk({ sessionId, sequenceNumber, buffer, mimeType }) {
    return this.adapter.uploadChunk({ sessionId, sequenceNumber, buffer, mimeType })
  }

  async resolveChunkKeys(sessionId) {
    const records = await listChunksForSession(sessionId)
    if (records.length > 0) {
      return records
        .sort((a, b) => a.sequenceNumber - b.sequenceNumber)
        .map((r) => r.storageKey)
        .filter(Boolean)
    }
    return chunkStore.listChunks(sessionId)
  }

  /**
   * Merge uploaded chunks into a single recording and persist playback URL on the session.
   */
  async mergeChunks(sessionId, { force = false } = {}) {
    const started = Date.now()
    await updateSession(sessionId, { mergeStatus: 'processing' })

    const session = await getSession(sessionId)
    const sd = session?.session_data ?? {}
    const expectedCount =
      sd.expectedChunkCount ??
      (Number.isFinite(sd.lastChunkIndex) ? sd.lastChunkIndex + 1 : null) ??
      sd.chunkCount ??
      0

    let keys = await this.resolveChunkKeys(sessionId)

    if (!force && expectedCount > keys.length) {
      keys = await waitForUploadedChunks(sessionId, expectedCount, (id) =>
        this.resolveChunkKeys(id)
      )
    } else if (force && expectedCount > keys.length) {
      keys = await waitForUploadedChunks(
        sessionId,
        expectedCount,
        (id) => this.resolveChunkKeys(id),
        { timeoutMs: 60000 }
      )
    }

    if (keys.length === 0) {
      throw new Error('No chunks available to merge')
    }

    const result = await this.adapter.mergeChunks(sessionId, keys)
    const durationMs = Date.now() - started

    const playbackPath = `/api/recordings/${sessionId}/video`

    await updateSession(sessionId, {
      mergeStatus: 'done',
      mergedMediaKey: result.storageKey,
      recordingUrl: playbackPath,
      recordingStorageKey: result.storageKey,
      mergeDurationMs: durationMs,
      mergedChunkCount: result.chunkCount,
      mergeError: null,
    })

    emitTranscriptionProgress(sessionId, {
      status: 'processing',
      progress: 25,
      message: 'Recording merged',
      mergeStatus: 'done',
    })

    logProcessingTime('SQS.AudioMerge', durationMs, {
      sessionId,
      storageProvider: env.storageProvider,
      chunkCount: result.chunkCount,
    })

    return {
      sessionId,
      url: resolvePublicRecordingUrl({
        session_data: { recordingUrl: playbackPath },
      }),
      recordingUrl: playbackPath,
      storageKey: result.storageKey,
      chunkCount: result.chunkCount,
      mergedPath: result.localPath,
      durationMs,
    }
  }

  /**
   * Return a URL recruiters/candidates can use to replay the merged recording.
   */
  async getVideoUrl(sessionId, options = {}) {
    const session = await getSession(sessionId)
    if (!session) return null

    const stored = session.session_data?.recordingUrl
    if (stored) {
      if (stored.startsWith('http://') || stored.startsWith('https://')) {
        return stored
      }
      if (env.storageProvider === 's3' && env.s3.bucket) {
        const storageKey =
          options.storageKey ??
          session.session_data?.recordingStorageKey ??
          `recordings/${sessionId}/merged.webm`
        return this.adapter.getVideoUrl(sessionId, { storageKey })
      }
      return resolvePublicRecordingUrl(session)
    }

    return this.adapter.getVideoUrl(sessionId, options)
  }

  getLocalMergedPath(sessionId) {
    if (typeof this.adapter.getLocalMergedPath === 'function') {
      return this.adapter.getLocalMergedPath(sessionId)
    }
    return chunkStore.getMergedPath(sessionId)
  }
}
