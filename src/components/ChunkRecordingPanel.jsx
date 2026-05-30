import { UploadSyncStatus } from './UploadSyncStatus.jsx'
import { SYNC_STATUS } from '../lib/interview/chunkUploadQueue.js'

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export function ChunkRecordingPanel({
  sessionId,
  stream,
  isRecording,
  recordingSeconds,
  uploaded,
  failed,
  pending,
  retries,
  uploadProgress,
  lastError,
  syncStatus,
  isOnline,
  onStart,
  onStop,
  onRetryUploads,
  compact = false,
}) {
  const canRecord = !!sessionId && !!stream
  const totalHandled = uploaded + failed
  const showPersistHint =
    pending > 0 && syncStatus === SYNC_STATUS.OFFLINE

  const handleStart = () => {
    if (!canRecord) return
    onStart?.()
  }

  return (
    <div className={`glass-card rounded-2xl border border-white/10 ${compact ? 'p-4' : 'p-5'}`}>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h3 className="font-semibold text-sm">Chunk streaming</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            2s WebM chunks · up to 4 parallel uploads
            {sessionId ? ` · ${sessionId.slice(0, 8)}…` : ''}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <UploadSyncStatus
            syncStatus={syncStatus}
            isOnline={isOnline}
            pending={pending}
            compact={compact}
          />
          {isRecording && (
            <span className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-red-500/20 border border-red-400/40 text-red-200 text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse-soft" />
              REC {formatDuration(recordingSeconds)}
            </span>
          )}
        </div>
      </div>

      {!sessionId && (
        <p className="text-xs text-amber-300/90 mb-3">
          Start the interview session before chunk uploads can begin.
        </p>
      )}

      {sessionId && !stream && (
        <p className="text-xs text-amber-300/90 mb-3">
          Waiting for camera stream — allow camera access above.
        </p>
      )}

      {showPersistHint && (
        <p className="text-xs text-amber-300/90 mb-3 bg-amber-500/10 border border-amber-400/20 rounded-lg px-3 py-2">
          You are offline — {pending} chunk{pending > 1 ? 's' : ''} saved locally and will upload
          automatically when connection returns.
        </p>
      )}

      {lastError && syncStatus !== SYNC_STATUS.OFFLINE && (
        <p className="text-xs text-red-300/90 mb-3 bg-red-500/10 border border-red-400/20 rounded-lg px-3 py-2">
          {lastError}
        </p>
      )}

      <div className="grid grid-cols-3 gap-2 text-center mb-4">
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-400/20 py-2">
          <p className="text-lg font-bold text-emerald-300">{uploaded}</p>
          <p className="text-[10px] text-gray-500 uppercase tracking-wide">Uploaded</p>
        </div>
        <div className="rounded-xl bg-amber-500/10 border border-amber-400/20 py-2">
          <p className="text-lg font-bold text-amber-300">{pending}</p>
          <p className="text-[10px] text-gray-500 uppercase tracking-wide">Queued</p>
        </div>
        <div className="rounded-xl bg-red-500/10 border border-red-400/20 py-2">
          <p className="text-lg font-bold text-red-300">{failed}</p>
          <p className="text-[10px] text-gray-500 uppercase tracking-wide">Failed</p>
        </div>
      </div>

      <div className="mb-4">
        <div className="flex justify-between text-xs text-gray-400 mb-1.5">
          <span>Upload progress</span>
          <span>
            {uploadProgress}% · {totalHandled} chunks
            {retries > 0 && <span className="text-amber-400"> · {retries} retries</span>}
          </span>
        </div>
        <div className="h-2 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all duration-500"
            style={{ width: `${Math.min(100, uploadProgress)}%` }}
          />
        </div>
        {pending > 0 && isOnline && syncStatus === SYNC_STATUS.RETRYING && (
          <p className="text-xs text-amber-400/90 mt-2">
            Retrying uploads with backoff (1s → 2s → 4s → 8s)…
          </p>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        {!isRecording ? (
          <button
            type="button"
            disabled={!canRecord}
            onClick={handleStart}
            className="btn-primary flex-1 py-2.5 text-sm disabled:opacity-40 min-w-[120px]"
          >
            Start recording
          </button>
        ) : (
          <button
            type="button"
            onClick={onStop}
            className="flex-1 py-2.5 text-sm rounded-xl font-semibold bg-red-600 hover:bg-red-500 text-white border border-red-400/50 min-w-[120px]"
          >
            Stop recording
          </button>
        )}
        {(failed > 0 || pending > 0) && onRetryUploads && (
          <button
            type="button"
            onClick={onRetryUploads}
            disabled={!isOnline}
            className="btn-secondary py-2.5 text-sm px-4"
          >
            Retry uploads
          </button>
        )}
      </div>
    </div>
  )
}
