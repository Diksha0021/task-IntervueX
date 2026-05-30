import { SYNC_STATUS } from '../lib/interview/chunkUploadQueue.js'

const STATUS_CONFIG = {
  [SYNC_STATUS.SYNCED]: {
    label: 'Synced',
    className: 'bg-emerald-500/15 border-emerald-400/35 text-emerald-300',
    dot: 'bg-emerald-400',
    pulse: false,
  },
  [SYNC_STATUS.UPLOADING]: {
    label: 'Uploading',
    className: 'bg-cyan-500/15 border-cyan-400/35 text-cyan-300',
    dot: 'bg-cyan-400',
    pulse: true,
  },
  [SYNC_STATUS.OFFLINE]: {
    label: 'Offline',
    className: 'bg-red-500/15 border-red-400/35 text-red-300',
    dot: 'bg-red-400',
    pulse: false,
  },
  [SYNC_STATUS.RETRYING]: {
    label: 'Retrying',
    className: 'bg-amber-500/15 border-amber-400/35 text-amber-300',
    dot: 'bg-amber-400',
    pulse: true,
  },
}

export function UploadSyncStatus({ syncStatus, isOnline, pending = 0, compact = false }) {
  const status = !isOnline ? SYNC_STATUS.OFFLINE : syncStatus ?? SYNC_STATUS.SYNCED
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG[SYNC_STATUS.SYNCED]

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 ${config.className} ${
        compact ? 'text-[10px]' : 'text-xs'
      }`}
      role="status"
      aria-live="polite"
    >
      <span
        className={`w-2 h-2 rounded-full shrink-0 ${config.dot} ${
          config.pulse ? 'animate-pulse-soft' : ''
        }`}
      />
      <span className="font-semibold">{config.label}</span>
      {pending > 0 && status !== SYNC_STATUS.SYNCED && (
        <span className="opacity-80">· {pending} pending</span>
      )}
    </div>
  )
}
