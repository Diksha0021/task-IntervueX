import { useState, useRef, useCallback, useEffect } from 'react'
import { logFailure, logWarning } from '../lib/failure/failureLogger.js'
import { getUserMessage } from '../lib/failure/userMessages.js'

const ENHANCED_AUDIO = {
  echoCancellation: { ideal: true },
  noiseSuppression: { ideal: true },
  autoGainControl: { ideal: true },
  channelCount: { ideal: 1 },
  sampleRate: { ideal: 48000 },
  // Lower capture latency so mic audio aligns with video in the recording.
  latency: { ideal: 0, max: 0.02 },
}

const CONSTRAINT_ATTEMPTS = [
  {
    video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: ENHANCED_AUDIO,
  },
  { video: { facingMode: 'user' }, audio: ENHANCED_AUDIO },
  { video: true, audio: ENHANCED_AUDIO },
  { video: true, audio: true },
  { video: true, audio: false },
]

async function diagnoseMediaError(lastError, wantsAudio) {
  if (!navigator.mediaDevices?.getUserMedia) {
    return { message: getUserMessage('camera_unsupported'), cameraDenied: false, micDenied: false }
  }

  const denied =
    lastError?.name === 'NotAllowedError' || lastError?.name === 'PermissionDeniedError'

  if (!denied) {
    if (lastError?.name === 'NotFoundError') {
      return {
        message: wantsAudio ? getUserMessage('camera_not_found') : getUserMessage('camera_not_found'),
        cameraDenied: false,
        micDenied: false,
      }
    }
    if (lastError?.name === 'NotReadableError') {
      return { message: getUserMessage('camera_in_use'), cameraDenied: false, micDenied: false }
    }
    if (!window.isSecureContext && location.hostname !== 'localhost') {
      return {
        message: 'Camera requires HTTPS or localhost. Open the app at http://localhost:5173',
        cameraDenied: false,
        micDenied: false,
      }
    }
    return { message: getUserMessage('generic'), cameraDenied: false, micDenied: false }
  }

  let cameraDenied = true
  let micDenied = wantsAudio

  try {
    const videoOnly = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
    videoOnly.getTracks().forEach((t) => t.stop())
    cameraDenied = false
    micDenied = true
  } catch {
    cameraDenied = true
    micDenied = wantsAudio
  }

  let message = getUserMessage('camera_mic_denied')
  if (cameraDenied && !micDenied) message = getUserMessage('camera_denied')
  if (!cameraDenied && micDenied) message = getUserMessage('microphone_denied')

  return { message, cameraDenied, micDenied }
}

export function useCameraStream({ audio = false, autoStart = false } = {}) {
  const streamRef = useRef(null)
  const mountedRef = useRef(true)
  const startingRef = useRef(false)
  const [stream, setStream] = useState(null)
  const [status, setStatus] = useState(autoStart ? 'loading' : 'idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [cameraDenied, setCameraDenied] = useState(false)
  const [micDenied, setMicDenied] = useState(false)
  const [missingMicrophone, setMissingMicrophone] = useState(false)

  const stop = useCallback(() => {
    startingRef.current = false
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    setStream(null)
    setStatus('idle')
    setErrorMsg('')
    setPermissionDenied(false)
    setCameraDenied(false)
    setMicDenied(false)
    setMissingMicrophone(false)
  }, [])

  const start = useCallback(async () => {
    if (startingRef.current) return streamRef.current

    if (!navigator.mediaDevices?.getUserMedia) {
      const msg = getUserMessage('camera_unsupported')
      logFailure('camera', msg, {})
      setStatus('error')
      setErrorMsg(msg)
      return null
    }

    startingRef.current = true
    setStatus('loading')
    setErrorMsg('')
    setPermissionDenied(false)
    setCameraDenied(false)
    setMicDenied(false)
    setMissingMicrophone(false)

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      setStream(null)
    }

    const attempts = audio
      ? CONSTRAINT_ATTEMPTS
      : CONSTRAINT_ATTEMPTS.map((c) => ({ ...c, audio: false }))

    let lastError = null
    let gotStreamWithoutAudio = false

    for (const constraints of attempts) {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia(constraints)
        if (!mountedRef.current) {
          mediaStream.getTracks().forEach((t) => t.stop())
          return null
        }

        const hasAudioTrack = mediaStream.getAudioTracks().length > 0
        if (audio && !hasAudioTrack && constraints.audio === false) {
          gotStreamWithoutAudio = true
        }

        streamRef.current = mediaStream
        setStream(mediaStream)
        startingRef.current = false
        setStatus('active')
        setPermissionDenied(false)

        if (audio && !hasAudioTrack) {
          setMissingMicrophone(true)
          logWarning('microphone', getUserMessage('microphone_denied'), {
            fallbackVideoOnly: true,
          })
        }

        return mediaStream
      } catch (err) {
        lastError = err
      }
    }

    startingRef.current = false
    if (!mountedRef.current) return null

    const diagnosis = await diagnoseMediaError(lastError, audio)
    const denied =
      lastError?.name === 'NotAllowedError' || lastError?.name === 'PermissionDeniedError'

    setPermissionDenied(denied)
    setCameraDenied(diagnosis.cameraDenied)
    setMicDenied(diagnosis.micDenied)
    setStatus('error')
    setErrorMsg(diagnosis.message)

    logFailure(denied ? 'camera' : 'camera', diagnosis.message, {
      error: lastError?.name,
      cameraDenied: diagnosis.cameraDenied,
      micDenied: diagnosis.micDenied,
      gotStreamWithoutAudio,
    })

    return null
  }, [audio])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!autoStart) return
    start()
  }, [autoStart, start])

  const hasVideo = !!(stream && stream.getVideoTracks().some((t) => t.readyState === 'live'))
  const hasAudio = !!(stream && stream.getAudioTracks().some((t) => t.readyState === 'live'))

  return {
    stream,
    streamRef,
    status,
    errorMsg,
    permissionDenied,
    cameraDenied,
    micDenied,
    missingMicrophone,
    hasVideo,
    hasAudio,
    start,
    stop,
    isActive: status === 'active' && !!stream,
  }
}
