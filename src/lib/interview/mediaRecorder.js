import { createChunkUploadQueue } from './chunkUploadQueue.js'
import { buildChunkId } from './chunkUpload.js'
import { logFailure, logWarning } from '../failure/failureLogger.js'
import { getUserMessage } from '../failure/userMessages.js'

export const CHUNK_INTERVAL_MS = 8000
const MIN_CHUNK_SIZE = 256
const RECORDER_BITRATE = {
  videoBitsPerSecond: 1_200_000,
  audioBitsPerSecond: 128_000,
}

const MIME_CANDIDATES = [
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp9,opus',
  'video/webm',
  'video/mp4',
]

function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return ''
  for (const type of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(type)) return type
  }
  return ''
}

function hasLiveTracks(stream) {
  const tracks = stream?.getTracks?.() ?? []
  return tracks.length > 0 && tracks.some((t) => t.readyState === 'live' && t.enabled)
}

function createMediaRecorder(stream, mimeType) {
  const options = { mimeType, ...RECORDER_BITRATE }
  try {
    return new MediaRecorder(stream, options)
  } catch {
    try {
      return new MediaRecorder(stream, { mimeType: 'video/webm', ...RECORDER_BITRATE })
    } catch {
      return new MediaRecorder(stream)
    }
  }
}

/**
 * MediaRecorder chunk recorder with persistent upload queue + network recovery.
 */
export function createChunkRecorder(sessionId, onStatus, { initialChunkIndex = 0 } = {}) {
  let recorder = null
  let chunkIndex = Math.max(0, Number(initialChunkIndex) || 0)
  const enqueuedChunkIds = new Set()
  let recordingStartedAt = null
  let stopped = false
  let recordStream = null
  let dataRequestTimer = null

  const uploadQueue = createChunkUploadQueue(sessionId, onStatus)

  const mimeType = pickMimeType()

  function emit(type, extra = {}) {
    onStatus?.({
      type,
      sessionId,
      chunkIndex,
      pending: uploadQueue.getPendingCount(),
      syncStatus: uploadQueue.getSyncStatus(),
      recordingSeconds: recordingStartedAt
        ? Math.floor((Date.now() - recordingStartedAt) / 1000)
        : 0,
      ...extra,
    })
  }

  function enqueue(blob, index, timestamp) {
    if (blob.size < MIN_CHUNK_SIZE) {
      emit('chunk_skipped', { chunkIndex: index, reason: 'empty', size: blob.size })
      return
    }

    const chunkId = buildChunkId(sessionId, index, timestamp)
    if (enqueuedChunkIds.has(chunkId)) {
      emit('chunk_skipped', { chunkIndex: index, reason: 'duplicate', chunkId })
      return
    }
    enqueuedChunkIds.add(chunkId)

    uploadQueue.enqueue({
      blob,
      sequenceNumber: index,
      timestamp,
      chunkId,
    })
  }

  function setInitialChunkIndex(nextIndex) {
    const n = Math.max(0, Number(nextIndex) || 0)
    if (n > chunkIndex) chunkIndex = n
  }

  function attachTrackEndedHandlers(stream) {
    stream?.getVideoTracks().forEach((t) => {
      t.addEventListener('ended', onTrackEnded)
    })
  }

  function detachTrackEndedHandlers(stream) {
    stream?.getVideoTracks().forEach((t) => {
      t.removeEventListener('ended', onTrackEnded)
    })
  }

  function onTrackEnded() {
    emit('camera_disconnect')
  }

  function clearDataRequestTimer() {
    if (dataRequestTimer) {
      clearInterval(dataRequestTimer)
      dataRequestTimer = null
    }
  }

  function startDataRequestTimer() {
    clearDataRequestTimer()
    const requestChunk = () => {
      if (stopped || recorder?.state !== 'recording') return
      try {
        recorder.requestData()
      } catch {
        /* ignore */
      }
    }
    setTimeout(requestChunk, 4000)
    dataRequestTimer = setInterval(requestChunk, CHUNK_INTERVAL_MS)
  }

  function releaseRecorder() {
    clearDataRequestTimer()
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.requestData()
        recorder.stop()
      } catch {
        /* ignore */
      }
    }
    detachTrackEndedHandlers(recordStream)
    recorder = null
    recordStream = null
  }

  function start(stream) {
    if (typeof MediaRecorder === 'undefined') {
      emit('error', { message: 'MediaRecorder is not supported in this browser' })
      return false
    }

    if (!stream) {
      emit('error', { message: 'No camera stream available' })
      return false
    }

    if (!hasLiveTracks(stream)) {
      const msg = getUserMessage('recording_no_stream')
      logFailure('recording', msg, { sessionId })
      emit('error', { message: msg })
      return false
    }

    const audioTracks = stream.getAudioTracks?.() ?? []
    if (audioTracks.length === 0) {
      logWarning('recording', 'Recording started without microphone audio track', { sessionId })
      emit('recording_no_audio', { message: getUserMessage('microphone_denied') })
    }

    if (!mimeType) {
      emit('error', { message: 'No supported video recording format found' })
      return false
    }

    if (recorder?.state === 'recording') return true

    stopped = false
    recordingStartedAt = Date.now()

    try {
      releaseRecorder()
      recordStream = stream
      attachTrackEndedHandlers(recordStream)

      recorder = createMediaRecorder(recordStream, mimeType)

      recorder.ondataavailable = (event) => {
        if (stopped) return
        if (event.data?.size > 0) {
          const index = chunkIndex++
          const timestamp = Date.now()
          enqueue(event.data, index, timestamp)
        }
      }

      recorder.onerror = (event) => {
        emit('recorder_error', { error: event.error?.message ?? 'Recorder error' })
      }

      recorder.onstop = () => {
        emit('recorder_stopped')
      }

      // No timeslice — first blob carries the WebM header; later blobs are continuations
      // that concatenate cleanly and keep audio/video in sync.
      recorder.start()
      startDataRequestTimer()
      emit('recording_started', { mimeType, chunkIntervalMs: CHUNK_INTERVAL_MS })
      return true
    } catch (err) {
      releaseRecorder()
      recordingStartedAt = null
      const msg = getUserMessage('recording_failed')
      logFailure('recording', msg, { sessionId, error: err.message })
      emit('error', { message: msg })
      return false
    }
  }

  function stop() {
    stopped = true
    releaseRecorder()
    recordingStartedAt = null
    emit('recording_stopped')
  }

  async function stopAndFlush() {
    stopped = true

    if (recorder?.state === 'recording') {
      await new Promise((resolve) => {
        const finalize = () => {
          try {
            recorder?.stop()
          } catch {
            /* ignore */
          }
          setTimeout(resolve, 250)
        }
        try {
          recorder.requestData()
        } catch {
          finalize()
          return
        }
        setTimeout(finalize, 350)
      })
    }

    releaseRecorder()
    recordingStartedAt = null
    emit('recording_stopped')
    return uploadQueue.flushAndWait(120000)
  }

  function flushPending() {
    return uploadQueue.flush()
  }

  function flushAndWait(timeoutMs) {
    return uploadQueue.flushAndWait(timeoutMs)
  }

  return {
    start,
    stop,
    stopAndFlush,
    flushPending,
    flushAndWait,
    setInitialChunkIndex,
    retryFailedUploads: () => uploadQueue.retryFailed(),
    getChunkIndex: () => chunkIndex,
    getPendingCount: () => uploadQueue.getPendingCount(),
    getSyncStatus: () => uploadQueue.getSyncStatus(),
    isRecording: () => recorder?.state === 'recording',
    getRecordingSeconds: () =>
      recordingStartedAt ? Math.floor((Date.now() - recordingStartedAt) / 1000) : 0,
    destroy: () => uploadQueue.destroy(),
  }
}
