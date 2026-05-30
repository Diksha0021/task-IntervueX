import { useState, useRef, useCallback, useEffect } from 'react'
import { createChunkRecorder } from '../lib/interview/mediaRecorder.js'
import { SYNC_STATUS, subscribeNetworkStatus, isBrowserOnline } from '../lib/interview/chunkUploadQueue.js'

const initialStats = () => ({
  isRecording: false,
  uploaded: 0,
  failed: 0,
  pending: 0,
  retries: 0,
  recordingSeconds: 0,
  lastChunkIndex: -1,
  lastError: null,
  syncStatus: SYNC_STATUS.SYNCED,
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
})

/**
 * Hook for MediaRecorder chunk streaming with upload progress, timer, and network recovery.
 */
export function useChunkRecorder(sessionId, onStatus, { initialChunkIndex = 0 } = {}) {
  const [stats, setStats] = useState(initialStats)
  const recorderRef = useRef(null)
  const initialIndexRef = useRef(initialChunkIndex)
  const streamRef = useRef(null)
  const timerRef = useRef(null)
  const onStatusRef = useRef(onStatus)

  useEffect(() => {
    onStatusRef.current = onStatus
  }, [onStatus])

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const startTimer = useCallback(() => {
    clearTimer()
    timerRef.current = setInterval(() => {
      if (recorderRef.current?.isRecording()) {
        setStats((s) => ({
          ...s,
          recordingSeconds: recorderRef.current.getRecordingSeconds(),
          pending: recorderRef.current.getPendingCount(),
          syncStatus: recorderRef.current.getSyncStatus?.() ?? s.syncStatus,
        }))
      }
    }, 1000)
  }, [clearTimer])

  const handleRecorderStatus = useCallback((status) => {
    onStatusRef.current?.(status)

    setStats((s) => {
      const next = { ...s }

      switch (status.type) {
        case 'recording_started':
          next.isRecording = true
          next.recordingSeconds = 0
          next.lastError = null
          break
        case 'recording_stopped':
        case 'recorder_stopped':
          next.isRecording = false
          break
        case 'error':
        case 'recorder_error':
          next.isRecording = false
          next.lastError = status.message ?? status.error ?? 'Recording failed'
          break
        case 'chunk_uploaded':
          next.uploaded = s.uploaded + 1
          next.lastChunkIndex = status.chunkIndex
          next.pending = status.pending ?? s.pending
          break
        case 'chunk_failed':
          next.failed = s.failed + 1
          next.pending = status.pending ?? s.pending
          next.lastError = status.error ?? 'Chunk upload failed'
          break
        case 'chunk_retry':
          next.retries = s.retries + 1
          next.pending = status.pending ?? s.pending
          break
        case 'queue_updated':
        case 'drain_complete':
        case 'upload_started':
        case 'queue_restored':
          next.pending = status.pending ?? s.pending
          break
        case 'network_offline':
          next.isOnline = false
          break
        case 'network_online':
          next.isOnline = true
          break
        default:
          break
      }

      if (status.syncStatus) next.syncStatus = status.syncStatus
      if (status.isOnline !== undefined) next.isOnline = status.isOnline
      if (status.pending !== undefined) next.pending = status.pending

      return next
    })
  }, [])

  useEffect(() => {
    initialIndexRef.current = initialChunkIndex
    recorderRef.current?.setInitialChunkIndex?.(initialChunkIndex)
  }, [initialChunkIndex])

  const ensureRecorder = useCallback(() => {
    if (!sessionId) return null
    if (!recorderRef.current) {
      recorderRef.current = createChunkRecorder(sessionId, handleRecorderStatus, {
        initialChunkIndex: initialIndexRef.current,
      })
    }
    return recorderRef.current
  }, [sessionId, handleRecorderStatus])

  const setInitialChunkIndex = useCallback((index) => {
    initialIndexRef.current = Math.max(0, Number(index) || 0)
    recorderRef.current?.setInitialChunkIndex?.(initialIndexRef.current)
  }, [])

  const retryFailedUploads = useCallback(() => {
    recorderRef.current?.retryFailedUploads?.()
  }, [])

  const startRecording = useCallback(
    (stream) => {
      if (!sessionId) {
        setStats((s) => ({ ...s, lastError: 'No interview session — start the interview first' }))
        return false
      }
      if (!stream) {
        setStats((s) => ({ ...s, lastError: 'No camera stream — enable camera first' }))
        return false
      }

      streamRef.current = stream
      const recorder = ensureRecorder()
      if (!recorder) {
        setStats((s) => ({ ...s, lastError: 'Could not initialize recorder' }))
        return false
      }

      const ok = recorder.start(stream)
      if (ok) startTimer()
      return ok
    },
    [sessionId, ensureRecorder, startTimer]
  )

  const stopRecording = useCallback(async () => {
    clearTimer()
    if (recorderRef.current?.stopAndFlush) {
      const result = await recorderRef.current.stopAndFlush()
      setStats((s) => ({ ...s, isRecording: false }))
      return result
    }
    recorderRef.current?.stop()
    setStats((s) => ({ ...s, isRecording: false }))
    return recorderRef.current?.flushAndWait?.(120000) ?? { ok: true, pending: 0 }
  }, [clearTimer])

  const resetStats = useCallback(() => {
    setStats(initialStats())
  }, [])

  useEffect(() => {
    ensureRecorder()
    return () => {
      clearTimer()
      recorderRef.current?.stop()
      recorderRef.current?.destroy?.()
      recorderRef.current = null
    }
  }, [sessionId, clearTimer, ensureRecorder])

  useEffect(() => {
    if (!sessionId) {
      clearTimer()
      recorderRef.current?.destroy?.()
      recorderRef.current?.stop()
      recorderRef.current = null
      resetStats()
    }
  }, [sessionId, resetStats, clearTimer])

  useEffect(() => {
    const unsub = subscribeNetworkStatus((online) => {
      setStats((s) => ({
        ...s,
        isOnline: online,
        syncStatus: online
          ? recorderRef.current?.getSyncStatus?.() ?? SYNC_STATUS.SYNCED
          : SYNC_STATUS.OFFLINE,
      }))
      if (online) recorderRef.current?.flushPending?.()
    })
    setStats((s) => ({ ...s, isOnline: isBrowserOnline() }))
    return unsub
  }, [])

  const uploadProgress =
    stats.uploaded + stats.failed + stats.pending > 0
      ? Math.round((stats.uploaded / (stats.uploaded + stats.failed + stats.pending)) * 100)
      : 0

  return {
    ...stats,
    uploadProgress,
    startRecording,
    stopRecording,
    flushPending: () => recorderRef.current?.flushPending?.(),
    flushAndWait: (ms) => recorderRef.current?.flushAndWait?.(ms),
    getChunkIndex: () => recorderRef.current?.getChunkIndex?.() ?? 0,
    retryFailedUploads,
    setInitialChunkIndex,
    isActive: stats.isRecording,
    getPendingCount: () => recorderRef.current?.getPendingCount() ?? stats.pending,
  }
}
