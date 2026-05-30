import { useRef, useEffect } from 'react'
import { useCameraStream } from '../hooks/useCameraStream.js'

export function CameraPreview({
  stream,
  status,
  errorMsg,
  permissionDenied = false,
  missingMicrophone = false,
  cameraDenied = false,
  micDenied = false,
  onRetry,
  onStop,
  showRec = false,
  allowStop = true,
  showControls = false,
  startLabel = 'Enable Camera & Microphone',
  audio = false,
  onVideoReady,
  className = '',
}) {
  const videoRef = useRef(null)
  const onVideoReadyRef = useRef(onVideoReady)
  const lastStreamRef = useRef(null)

  useEffect(() => {
    onVideoReadyRef.current = onVideoReady
  }, [onVideoReady])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !stream || status !== 'active') return

    video.srcObject = stream
    video.play().catch(() => {})

    if (lastStreamRef.current !== stream) {
      lastStreamRef.current = stream
      onVideoReadyRef.current?.(video)
    }
  }, [stream, status])

  const showLiveFeed = status === 'active' && stream

  return (
    <div className={`w-full ${className}`}>
      <div className="aspect-video rounded-2xl bg-black border border-cyan-400/30 overflow-hidden relative">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          aria-label="Live webcam preview"
          className={`w-full h-full object-cover mirror transition-opacity duration-300 ${
            showLiveFeed ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {status === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/95 gap-3 z-10">
            <div className="w-10 h-10 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-300 text-sm font-medium">Requesting camera access…</p>
            <p className="text-gray-500 text-xs px-6 text-center">
              Allow permissions in your browser popup if prompted
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 gap-3 p-6 text-center z-10">
            <span className="text-4xl" aria-hidden>
              {permissionDenied ? '🚫' : '📷'}
            </span>
            <p className="text-sm font-medium text-red-300">
              {cameraDenied && !micDenied
                ? 'Camera blocked'
                : micDenied && !cameraDenied
                  ? 'Microphone blocked'
                  : permissionDenied
                    ? 'Permission denied'
                    : 'Could not start camera'}
            </p>
            <p className="text-gray-400 text-sm max-w-xs leading-relaxed">{errorMsg}</p>
            <button type="button" onClick={onRetry} className="btn-primary text-sm px-5 py-2.5 mt-1">
              Try again
            </button>
          </div>
        )}

        {status === 'idle' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-gray-900 to-black gap-4 p-6 text-center z-10">
            <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-400/30 flex items-center justify-center text-3xl">
              📷
            </div>
            <div>
              <p className="text-gray-200 font-medium">Live webcam preview</p>
              <p className="text-gray-500 text-sm mt-2 max-w-xs leading-relaxed">
                {audio
                  ? 'Enable your camera and microphone to verify devices before the interview.'
                  : 'Enable your camera to see a live preview before starting.'}
              </p>
            </div>
            <button type="button" onClick={onRetry} className="btn-primary px-6 py-3">
              {startLabel}
            </button>
          </div>
        )}

        {showLiveFeed && missingMicrophone && (
          <div className="absolute bottom-14 left-3 right-3 px-3 py-2 rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-100 text-xs z-10 text-center">
            Microphone unavailable — allow mic access for voice answers and recording audio.
          </div>
        )}

        {showLiveFeed && (
          <>
            <div className="absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-emerald-500/25 border border-emerald-400/40 text-emerald-200 text-xs font-semibold z-10">
              LIVE
            </div>
            {audio && stream.getAudioTracks().length > 0 && (
              <div className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-cyan-500/20 border border-cyan-400/30 text-cyan-200 text-xs font-medium z-10">
                🎤 Mic on
              </div>
            )}
            {showRec && (
              <div className="absolute bottom-3 left-3 flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/25 border border-red-400/40 text-red-200 text-xs z-10">
                <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse-soft" />
                REC
              </div>
            )}
            {allowStop && onStop && !showControls && (
              <button
                type="button"
                onClick={onStop}
                className="absolute bottom-3 right-3 px-3 py-1.5 rounded-lg bg-black/70 border border-white/20 text-white text-xs hover:bg-black/90 transition-colors z-10"
              >
                Stop
              </button>
            )}
          </>
        )}
      </div>

      {showControls && (
        <div className="mt-4 flex flex-wrap gap-3">
          {status !== 'active' ? (
            <button
              type="button"
              onClick={onRetry}
              disabled={status === 'loading'}
              className="btn-primary flex-1 min-w-[140px] py-2.5 text-sm disabled:opacity-50"
            >
              {status === 'loading' ? 'Starting…' : startLabel}
            </button>
          ) : (
            <button
              type="button"
              onClick={onStop}
              className="btn-secondary flex-1 min-w-[140px] py-2.5 text-sm border-red-400/30 text-red-200 hover:bg-red-500/10"
            >
              Stop camera
            </button>
          )}
          {status === 'error' && (
            <button type="button" onClick={onRetry} className="btn-secondary py-2.5 text-sm px-4">
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** Owns getUserMedia lifecycle — live webcam + optional mic */
export function CameraPreviewWithStream({
  audio = false,
  autoStart = false,
  showControls = false,
  startLabel,
  onStreamReady,
  onStreamEnd,
  onVideoReady,
  onPermissionDenied,
  allowStop = true,
  ...previewProps
}) {
  const camera = useCameraStream({ audio, autoStart })
  const notifiedRef = useRef(false)

  useEffect(() => {
    if (camera.status === 'active' && camera.stream) {
      if (!notifiedRef.current) {
        notifiedRef.current = true
        onStreamReady?.(camera.stream)
      }
    } else if (camera.status === 'idle' || camera.status === 'error') {
      notifiedRef.current = false
    }
  }, [camera.status, camera.stream, onStreamReady])

  useEffect(() => {
    if (camera.permissionDenied && camera.status === 'error') {
      onPermissionDenied?.()
    }
  }, [camera.permissionDenied, camera.status, onPermissionDenied])

  const handleStop = () => {
    camera.stop()
    onStreamEnd?.(audio)
  }

  return (
    <CameraPreview
      stream={camera.stream}
      status={camera.status}
      errorMsg={camera.errorMsg}
      permissionDenied={camera.permissionDenied}
      cameraDenied={camera.cameraDenied}
      micDenied={camera.micDenied}
      missingMicrophone={camera.missingMicrophone}
      onRetry={camera.start}
      onStop={allowStop ? handleStop : undefined}
      allowStop={allowStop}
      showControls={showControls}
      startLabel={startLabel ?? (audio ? 'Enable Camera & Microphone' : 'Enable Camera')}
      audio={audio}
      onVideoReady={onVideoReady}
      {...previewProps}
    />
  )
}
