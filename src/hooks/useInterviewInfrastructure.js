import { useState, useEffect, useRef, useCallback } from 'react'
import {
  createSession,
  getSession,
  patchSession,
  completeSession,
  checkApiHealth,
} from '../lib/interview/api.js'
import { createProctoringSocket } from '../lib/interview/proctoringSocket.js'
import { useChunkRecorder } from './useChunkRecorder.js'
import { checkFacePresence } from '../lib/interview/facePresence.js'
import {
  saveLocalSession,
  loadLocalSession,
  clearLocalSession,
  clearAllInterviewRecovery,
  clearInterviewProgress,
  getResumeSessionId,
  saveInterviewProgress,
  loadInterviewProgress,
} from '../lib/interview/sessionStorage.js'
import {
  mergeSessionWithProgress,
  buildCheckpointPatch,
  getRecoverySummary,
} from '../lib/interview/interviewRecovery.js'
import { useRealtimeSocket } from './useRealtimeSocket.js'
import { createCheckpointSyncQueue } from '../lib/failure/checkpointSyncQueue.js'
import { logFailure, logWarning } from '../lib/failure/failureLogger.js'
import { getUserMessage } from '../lib/failure/userMessages.js'

function formatAlertTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function alertMessageForEvent(event, sessionData) {
  switch (event) {
    case 'tab_switch':
      return `Candidate left the interview tab (${sessionData?.tabWarnings ?? 1} total)`
    case 'face_absence':
      return `Face not visible in camera (${sessionData?.faceAbsenceWarnings ?? 1} total)`
    case 'camera_disconnect':
      return 'Camera stream disconnected'
    default:
      return 'Proctoring event recorded'
  }
}

export function useInterviewInfrastructure() {
  const [session, setSession] = useState(null)
  const [apiOnline, setApiOnline] = useState(null)
  const [wsConnected, setWsConnected] = useState(false)
  const [networkOnline, setNetworkOnline] = useState(navigator.onLine)
  const [proctoring, setProctoring] = useState({
    tabWarnings: 0,
    faceAbsenceWarnings: 0,
    liveAlerts: [],
  })
  const [pipelineRealtime, setPipelineRealtime] = useState({
    mergeStatus: null,
    transcriptionStatus: null,
    transcriptionProgress: 0,
    message: null,
    transcriptionError: null,
  })
  const [serverChunkCount, setServerChunkCount] = useState(0)
  const [systemMessage, setSystemMessage] = useState(null)

  const socketRef = useRef(null)
  const checkpointQueueRef = useRef(null)
  if (!checkpointQueueRef.current) {
    checkpointQueueRef.current = createCheckpointSyncQueue()
  }
  const recordingStreamRef = useRef(null)
  const heartbeatStopRef = useRef(null)
  const faceCheckRef = useRef(null)
  const faceWarmupRef = useRef(null)
  const faceCanvasRef = useRef(null)
  const faceCtxRef = useRef(null)
  const lastFaceAlertRef = useRef(0)
  const faceAbsentSinceRef = useRef(null)
  const consecutiveAbsentRef = useRef(0)
  const faceAlertInFlightRef = useRef(false)
  const monitoringReadyRef = useRef(false)
  const faceVideoRef = useRef(null)

  const pushLiveAlert = useCallback((type, message) => {
    setProctoring((prev) => ({
      ...prev,
      liveAlerts: [
        { id: `${type}-${Date.now()}`, type, message, time: formatAlertTime() },
        ...prev.liveAlerts,
      ].slice(0, 10),
    }))
  }, [])

  const persistCheckpointRef = useRef(null)
  const chunkCheckpointTimerRef = useRef(null)

  const onChunkStatus = useCallback(
    (status) => {
      if (status.type === 'camera_disconnect') {
        socketRef.current?.send({ type: 'camera_disconnect' })
        pushLiveAlert('camera_disconnect', 'Camera stream disconnected')
        return
      }

      if (status.type === 'chunk_uploaded' || status.type === 'queue_updated') {
        if (chunkCheckpointTimerRef.current) clearTimeout(chunkCheckpointTimerRef.current)
        chunkCheckpointTimerRef.current = setTimeout(() => {
          persistCheckpointRef.current?.({
            uploadedChunkCount: status.uploaded ?? undefined,
          })
        }, 1500)
      }
    },
    [pushLiveAlert]
  )

  const initialChunkIndex =
    session?.session_data?.lastChunkIndex != null
      ? session.session_data.lastChunkIndex + 1
      : session?.session_data?.uploadedChunkCount ?? 0

  const chunkRecorder = useChunkRecorder(session?.id, onChunkStatus, { initialChunkIndex })

  const { connected: rtConnected } = useRealtimeSocket({
    sessionId: session?.id,
    enabled: !!session?.id,
    onChunkUploaded: (data) => {
      if (typeof data.chunkCount === 'number') {
        setServerChunkCount(data.chunkCount)
      }
    },
    onTranscriptionProgress: (data) => {
      setPipelineRealtime((prev) => ({
        ...prev,
        mergeStatus: data.mergeStatus ?? prev.mergeStatus,
        transcriptionStatus: data.status ?? prev.transcriptionStatus,
        transcriptionProgress: data.progress ?? prev.transcriptionProgress,
        message: data.message ?? prev.message,
        transcriptionError: data.error ?? null,
      }))
    },
    onInterviewCompleted: (data) => {
      setPipelineRealtime((prev) => ({
        ...prev,
        mergeStatus: data.mergeStatus ?? prev.mergeStatus,
        transcriptionStatus: data.transcriptionStatus ?? prev.transcriptionStatus,
      }))
      setSession((s) =>
        s
          ? {
              ...s,
              session_data: {
                ...s.session_data,
                status: 'completed',
                mergeStatus: data.mergeStatus ?? s.session_data?.mergeStatus,
                transcriptionStatus:
                  data.transcriptionStatus ?? s.session_data?.transcriptionStatus,
              },
            }
          : s
      )
    },
    onReportGenerated: (data) => {
      setSession((s) => {
        if (!s || s.id !== data.sessionId) return s
        const next = { ...s.session_data }
        if (data.report) next.report = { ...next.report, ...data.report }
        if (data.serverTranscript) {
          next.serverTranscript = data.serverTranscript
          next.transcription = data.serverTranscript
        }
        if (data.transcriptionStatus) next.transcriptionStatus = data.transcriptionStatus
        return { ...s, session_data: next }
      })
    },
  })

  const chunkStatus = {
    uploaded: chunkRecorder.uploaded,
    failed: chunkRecorder.failed,
    pending: chunkRecorder.pending,
    retries: chunkRecorder.retries,
    isRecording: chunkRecorder.isRecording,
    recordingSeconds: chunkRecorder.recordingSeconds,
    uploadProgress: chunkRecorder.uploadProgress,
    lastError: chunkRecorder.lastError,
    syncStatus: chunkRecorder.syncStatus,
    isOnline: chunkRecorder.isOnline,
  }

  const chunkStartRef = useRef(chunkRecorder.startRecording)
  const chunkStopRef = useRef(chunkRecorder.stopRecording)
  const chunkFlushRef = useRef(chunkRecorder.flushPending)
  const chunkRetryRef = useRef(chunkRecorder.retryFailedUploads)
  chunkStartRef.current = chunkRecorder.startRecording
  chunkStopRef.current = chunkRecorder.stopRecording
  chunkFlushRef.current = chunkRecorder.flushPending
  chunkRetryRef.current = chunkRecorder.retryFailedUploads

  const applySessionProctoring = useCallback((sessionData, event) => {
    if (!sessionData) return
    const tabWarnings = sessionData.tabWarnings ?? 0
    const faceAbsenceWarnings = sessionData.faceAbsenceWarnings ?? 0

    setProctoring((prev) => {
      const countsChanged =
        tabWarnings !== prev.tabWarnings || faceAbsenceWarnings !== prev.faceAbsenceWarnings
      if (!event && !countsChanged) return prev

      return {
        tabWarnings,
        faceAbsenceWarnings,
        liveAlerts: event
          ? [
              {
                id: `${event}-${Date.now()}`,
                type: event,
                message: alertMessageForEvent(event, sessionData),
                time: formatAlertTime(),
              },
              ...prev.liveAlerts,
            ].slice(0, 10)
          : prev.liveAlerts,
      }
    })
  }, [])

  useEffect(() => {
    checkApiHealth().then(setApiOnline)

    const healthInterval = setInterval(async () => {
      const ok = await checkApiHealth()
      setApiOnline((prev) => {
        if (prev === false && ok) {
          setSystemMessage({ text: getUserMessage('api_restored'), severity: 'info' })
          checkpointQueueRef.current?.flush()
          chunkRetryRef.current?.()
        }
        return ok
      })
    }, 15000)

    const onOnline = () => {
      setNetworkOnline(true)
      setSystemMessage({ text: getUserMessage('network_restored'), severity: 'info' })
      checkpointQueueRef.current?.flush()
      chunkFlushRef.current?.()
      chunkRetryRef.current?.()
    }
    const onOffline = () => {
      setNetworkOnline(false)
      logWarning('network', getUserMessage('network_offline'))
      setSystemMessage({ text: getUserMessage('network_offline'), severity: 'warn' })
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      clearInterval(healthInterval)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  const applyRestoredSession = useCallback(
    (data) => {
      if (!data) return null
      const progress = loadInterviewProgress()
      const merged = mergeSessionWithProgress(data, progress)
      setSession(merged)
      saveLocalSession(merged)
      applySessionProctoring(merged.session_data)
      return merged
    },
    [applySessionProctoring]
  )

  const initSession = useCallback(async ({ hardwareCheck, interviewProfile } = {}) => {
    const resumeId = getResumeSessionId()
    const data = await createSession({ hardwareCheck, resumeFrom: resumeId, interviewProfile })
    const progress = loadInterviewProgress()
    if (!resumeId || progress?.sessionId !== data.id) {
      clearInterviewProgress()
    }
    const merged = applyRestoredSession(data)
    return merged ?? data
  }, [applyRestoredSession])

  const resumeSession = useCallback(async () => {
    const local = loadLocalSession()
    const progress = loadInterviewProgress()
    const sessionId = local?.id ?? progress?.sessionId
    if (!sessionId) return null

    try {
      const data = await getSession(sessionId)
      const merged = applyRestoredSession(data)
      setSystemMessage({ text: getUserMessage('session_restored'), severity: 'info' })
      return merged
    } catch (err) {
      logFailure('session_restore', getUserMessage('session_restore_failed'), {
        sessionId,
        error: err.message,
      })
      if (local) {
        setSystemMessage({ text: getUserMessage('session_restored'), severity: 'warn' })
        return applyRestoredSession(local)
      }
      setSystemMessage({ text: getUserMessage('session_restore_failed'), severity: 'error' })
      return null
    }
  }, [applyRestoredSession])

  const sessionBootstrappedRef = useRef(false)
  useEffect(() => {
    if (sessionBootstrappedRef.current || session) return
    const resumeId = getResumeSessionId()
    if (!resumeId) return
    sessionBootstrappedRef.current = true
    resumeSession().catch(() => {})
  }, [session, resumeSession])

  const persistCheckpoint = useCallback(
    async (checkpoint) => {
      if (!session?.id) return null

      const patch = buildCheckpointPatch({
        ...checkpoint,
        questions: checkpoint.questions ?? session.session_data?.questions,
        uploadedChunkCount:
          checkpoint.uploadedChunkCount ??
          session.session_data?.uploadedChunkCount ??
          session.session_data?.uploadedChunkKeys?.length ??
          0,
        chunkUploadedKeys:
          checkpoint.chunkUploadedKeys ?? session.session_data?.uploadedChunkKeys,
      })

      const progress = {
        sessionId: session.id,
        status: session.session_data?.status ?? 'active',
        questionIndex: patch.questionIndex,
        answers: patch.answers,
        elapsed: patch.elapsed,
        readyToFinish: patch.readyToFinish,
        liveTranscript: patch.liveTranscript,
        currentQuestion: patch.currentQuestion,
        interviewProfileId: patch.interviewProfileId ?? session.session_data?.interviewProfileId,
        questions: patch.questions,
        uploadedChunkCount: patch.uploadedChunkCount,
        chunkUploadedKeys: patch.chunkUploadedKeys,
        updatedAt: Date.now(),
      }
      saveInterviewProgress(progress)

      const localMerged = {
        ...session,
        session_data: { ...session.session_data, ...patch },
      }
      saveLocalSession(localMerged)
      setSession(localMerged)

      try {
        const updated = await patchSession(session.id, patch)
        setSession(updated)
        saveLocalSession(updated)
        if (apiOnline === false) setApiOnline(true)
        return updated
      } catch (err) {
        checkpointQueueRef.current?.enqueue(session.id, patch)
        if (!networkOnline) {
          setSystemMessage({ text: getUserMessage('network_offline'), severity: 'warn' })
        } else {
          setSystemMessage({ text: getUserMessage('api_unreachable'), severity: 'warn' })
          logFailure('checkpoint', getUserMessage('api_unreachable'), {
            sessionId: session.id,
            error: err.message,
            severity: 'warn',
          })
        }
        return localMerged
      }
    },
    [session, apiOnline, networkOnline]
  )

  persistCheckpointRef.current = persistCheckpoint

  const syncSessionState = useCallback(
    async (patch) => persistCheckpoint(patch),
    [persistCheckpoint]
  )

  const ensureProctoringSocket = useCallback(
    (stream) => {
      if (!session?.id || !stream) return
      if (recordingStreamRef.current === stream && socketRef.current) return

      recordingStreamRef.current = stream
      socketRef.current?.close()

      socketRef.current = createProctoringSocket(session.id, {
        onConnect: () => setWsConnected(true),
        onDisconnect: () => setWsConnected(false),
        onMessage: (msg) => {
          if (msg.type === 'proctoring_update' && msg.session) {
            setSession((s) =>
              s ? { ...s, session_data: { ...s.session_data, ...msg.session } } : s
            )
            applySessionProctoring(msg.session, msg.event)
          }
        },
      })

      heartbeatStopRef.current = socketRef.current.startHeartbeat()
    },
    [session, applySessionProctoring]
  )

  const startChunkRecording = useCallback(
    (stream) => {
      if (!session?.id || !stream) return false
      ensureProctoringSocket(stream)
      return chunkStartRef.current(stream)
    },
    [session, ensureProctoringSocket]
  )

  const stopChunkRecording = useCallback(async () => {
    return chunkStopRef.current?.()
  }, [])

  /** Starts proctoring WebSocket + chunk MediaRecorder (used when interview camera is ready). */
  const startRecording = useCallback(
    (stream) => startChunkRecording(stream),
    [startChunkRecording]
  )

  const stopRecording = useCallback(async () => {
    await chunkStopRef.current?.()
    recordingStreamRef.current = null
    heartbeatStopRef.current?.()
    socketRef.current?.close()
    setWsConnected(false)
  }, [])

  const reportTabSwitch = useCallback(() => {
    socketRef.current?.send({ type: 'tab_switch' })
    pushLiveAlert('tab_switch', 'You left the interview tab — this was recorded')
  }, [pushLiveAlert])

  const reportFaceAbsence = useCallback(
    async (durationMs) => {
      if (faceAlertInFlightRef.current) return
      const now = Date.now()
      if (now - lastFaceAlertRef.current < 22000) return

      faceAlertInFlightRef.current = true
      lastFaceAlertRef.current = now
      faceAbsentSinceRef.current = null
      consecutiveAbsentRef.current = 0

      const sent = socketRef.current?.send?.({
        type: 'face_absence',
        durationMs,
      })

      if (!sent) {
        const sd = session?.session_data ?? {}
        const nextCount = (sd.faceAbsenceWarnings ?? proctoring.faceAbsenceWarnings ?? 0) + 1
        const at = new Date().toISOString()
        const logEntry = {
          type: 'face_absence',
          at,
          durationMs,
          message: 'Face not visible in camera feed',
        }
        try {
          await persistCheckpointRef.current?.({
            faceAbsenceWarnings: nextCount,
            proctoringLog: [...(sd.proctoringLog ?? []), logEntry].slice(-40),
            flags: [...(sd.flags ?? []), `face_absence at ${at}`],
          })
        } catch {
          setProctoring((prev) => ({
            ...prev,
            faceAbsenceWarnings: Math.max(prev.faceAbsenceWarnings, nextCount),
            liveAlerts: [
              {
                id: `face_absence-${Date.now()}`,
                type: 'face_absence',
                message: 'Face not visible — stay centered in frame',
                time: formatAlertTime(),
              },
              ...prev.liveAlerts,
            ].slice(0, 10),
          }))
        }
      }

      pushLiveAlert('face_absence', 'Face not visible — stay centered in frame')
      faceAlertInFlightRef.current = false
    },
    [session, proctoring.faceAbsenceWarnings, pushLiveAlert]
  )

  const stopFaceMonitoring = useCallback(() => {
    if (faceWarmupRef.current) {
      clearTimeout(faceWarmupRef.current)
      faceWarmupRef.current = null
    }
    if (faceCheckRef.current) {
      clearInterval(faceCheckRef.current)
      faceCheckRef.current = null
    }
    faceVideoRef.current = null
    monitoringReadyRef.current = false
  }, [])

  const startFaceMonitoring = useCallback(
    (videoEl) => {
      if (!videoEl) return
      if (faceVideoRef.current === videoEl && faceCheckRef.current) return

      stopFaceMonitoring()
      faceVideoRef.current = videoEl

      if (!faceCanvasRef.current) {
        faceCanvasRef.current = document.createElement('canvas')
        faceCtxRef.current = faceCanvasRef.current.getContext('2d', { willReadFrequently: true })
      }

      monitoringReadyRef.current = false
      faceAbsentSinceRef.current = null
      consecutiveAbsentRef.current = 0

      const stream = videoEl.srcObject
      if (stream && session?.id) {
        ensureProctoringSocket(stream)
      }

      faceWarmupRef.current = setTimeout(() => {
        monitoringReadyRef.current = true
      }, 3000)

      faceCheckRef.current = setInterval(() => {
        try {
          if (!monitoringReadyRef.current || faceVideoRef.current !== videoEl) return

          const track = videoEl.srcObject?.getVideoTracks?.()?.[0]
          if (!track || track.readyState !== 'live' || !track.enabled) return

          const { present, warming } = checkFacePresence(
            videoEl,
            faceCanvasRef.current,
            faceCtxRef.current
          )

          if (warming) return

          const now = Date.now()

          if (!present) {
            consecutiveAbsentRef.current += 1
            if (!faceAbsentSinceRef.current && consecutiveAbsentRef.current >= 2) {
              faceAbsentSinceRef.current = now
            }
            if (faceAbsentSinceRef.current) {
              const absentMs = now - faceAbsentSinceRef.current
              if (absentMs >= 3500) {
                reportFaceAbsence(absentMs)
              }
            }
          } else {
            faceAbsentSinceRef.current = null
            consecutiveAbsentRef.current = 0
          }
        } catch {
          /* ignore frame sampling errors */
        }
      }, 1500)
    },
    [session?.id, reportFaceAbsence, stopFaceMonitoring, ensureProctoringSocket]
  )

  const getProctoringSnapshot = useCallback(() => {
    const sd = session?.session_data ?? {}
    return {
      tabWarnings: Math.max(proctoring.tabWarnings, sd.tabWarnings ?? 0),
      faceAbsenceWarnings: Math.max(proctoring.faceAbsenceWarnings, sd.faceAbsenceWarnings ?? 0),
      proctoringLog: sd.proctoringLog ?? [],
      flags: sd.flags ?? [],
    }
  }, [session, proctoring])

  const finalizeInFlightRef = useRef(null)

  const finalizeSession = useCallback(
    async (sessionData, explicitSessionId) => {
      const sessionId = explicitSessionId ?? session?.id
      if (!sessionId) return null

      if (finalizeInFlightRef.current?.sessionId === sessionId) {
        return finalizeInFlightRef.current.promise
      }

      const run = async () => {
        setPipelineRealtime({
          mergeStatus: 'processing',
          transcriptionStatus: 'queued',
          transcriptionProgress: 0,
          message: 'Submitting interview report…',
          transcriptionError: null,
        })

        const uploadMeta = {
          expectedChunkCount: chunkRecorder.getChunkIndex?.() ?? sessionData.expectedChunkCount ?? 0,
          lastChunkIndex: Math.max(0, (chunkRecorder.getChunkIndex?.() ?? 1) - 1),
          uploadedChunkCount: chunkRecorder.uploaded ?? sessionData.uploadedChunkCount ?? 0,
        }

        const payload = {
          ...sessionData,
          ...uploadMeta,
          status: 'completed',
          submittedAt: new Date().toISOString(),
        }

        try {
          // Submit report first — recruiters must see partial/early-ended interviews immediately.
          const result = await completeSession(sessionId, payload)
          setSession(result)
          clearAllInterviewRecovery()

          Promise.race([
            chunkStopRef.current?.(),
            new Promise((resolve) => setTimeout(resolve, 15000)),
          ])
            .then(() => chunkFlushRef.current?.())
            .catch((err) => {
              logWarning('upload_flush', 'Post-submit upload flush failed', {
                sessionId,
                error: err.message,
              })
            })

          return result
        } catch (err) {
          logFailure('complete_session', getUserMessage('server_error'), {
            sessionId,
            error: err.message,
          })
          saveLocalSession({
            ...(session ?? { id: sessionId }),
            session_data: { ...sessionData, status: 'processing_failed' },
          })
          setSystemMessage({ text: getUserMessage('server_error'), severity: 'error' })
          throw err
        }
      }

      const promise = run()
      finalizeInFlightRef.current = { sessionId, promise }
      try {
        return await promise
      } finally {
        if (finalizeInFlightRef.current?.promise === promise) {
          finalizeInFlightRef.current = null
        }
      }
    },
    [session, chunkRecorder]
  )

  useEffect(() => () => {
    stopRecording()
    stopFaceMonitoring()
  }, [stopRecording, stopFaceMonitoring])

  return {
    session,
    apiOnline,
    wsConnected,
    rtConnected,
    networkOnline,
    chunkStatus,
    serverChunkCount,
    pipelineRealtime,
    proctoring,
    initSession,
    resumeSession,
    syncSessionState,
    persistCheckpoint,
    getRecoverySummary: () => (session ? getRecoverySummary(session) : null),
    startRecording,
    stopRecording,
    startChunkRecording,
    stopChunkRecording,
    reportTabSwitch,
    startFaceMonitoring,
    stopFaceMonitoring,
    finalizeSession,
    getProctoringSnapshot,
    hasResumableSession: !!getResumeSessionId(),
    systemMessage,
    clearSystemMessage: () => setSystemMessage(null),
    getChunkIndex: () => chunkRecorder.getChunkIndex?.() ?? 0,
    flushUploads: () => chunkRecorder.flushAndWait?.(120000),
    retryChunkUploads: () => chunkRecorder.retryFailedUploads?.(),
    pendingCheckpointCount: () => checkpointQueueRef.current?.getPendingCount?.() ?? 0,
  }
}
