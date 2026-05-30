import { UploadSyncStatus } from './UploadSyncStatus.jsx'
import { SYNC_STATUS } from '../lib/interview/chunkUploadQueue.js'

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export function InterviewStatusBar({ apiOnline, wsConnected, networkOnline, chunkStatus }) {
  const {
    uploaded = 0,
    failed = 0,
    pending = 0,
    retries = 0,
    isRecording = false,
    recordingSeconds = 0,
    uploadProgress = 0,
    syncStatus = SYNC_STATUS.SYNCED,
    isOnline = networkOnline,
  } = chunkStatus ?? {}

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      <StatusPill
        label="Network"
        ok={networkOnline}
        okText="Online"
        badText="Offline"
      />
      <StatusPill
        label="API"
        ok={apiOnline === true}
        bad={apiOnline === false}
        okText="Connected"
        badText={apiOnline === false ? 'Offline (local mode)' : 'Checking...'}
      />
      <StatusPill
        label="Proctoring"
        ok={wsConnected}
        okText="Live"
        badText="Reconnecting..."
      />
      <span
        className={`px-3 py-1 rounded-full text-xs border ${
          isRecording
            ? 'bg-red-500/10 border-red-400/30 text-red-300'
            : 'bg-white/5 border-white/10 text-gray-400'
        }`}
      >
        {isRecording ? `REC ${formatDuration(recordingSeconds)}` : 'Recording idle'}
      </span>
      <UploadSyncStatus
        syncStatus={syncStatus}
        isOnline={isOnline && networkOnline}
        pending={pending}
      />
    </div>
  )
}

function StatusPill({ label, ok, bad, okText, badText }) {
  const isOk = ok && !bad
  return (
    <span
      className={`px-3 py-1 rounded-full text-xs border ${
        isOk
          ? 'bg-emerald-500/10 border-emerald-400/30 text-emerald-300'
          : 'bg-yellow-500/10 border-yellow-400/30 text-yellow-300'
      }`}
    >
      {label}: {isOk ? okText : badText}
    </span>
  )
}
