const ALERT_META = {
  tab_switch: {
    icon: '🔄',
    label: 'Tab switch',
    className: 'border-yellow-400/40 bg-yellow-500/10 text-yellow-200',
  },
  face_absence: {
    icon: '👤',
    label: 'Face not visible',
    className: 'border-orange-400/40 bg-orange-500/10 text-orange-200',
  },
  camera_disconnect: {
    icon: '📷',
    label: 'Camera issue',
    className: 'border-red-400/40 bg-red-500/10 text-red-200',
  },
}

export function ProctoringAlerts({ tabWarnings, faceAbsenceWarnings, liveAlerts, wsConnected }) {
  const hasIssues = tabWarnings > 0 || faceAbsenceWarnings > 0 || liveAlerts.length > 0

  return (
    <div className="glass-card rounded-2xl p-4 border border-white/10">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🛡️</span>
          <h3 className="font-semibold text-sm">Live proctoring</h3>
        </div>
        <span
          className={`text-xs px-2 py-0.5 rounded-full ${
            wsConnected ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
          }`}
        >
          {wsConnected ? 'Monitoring active' : 'Reconnecting…'}
        </span>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        <span className="text-xs px-2.5 py-1 rounded-lg bg-white/5 border border-white/10">
          Tab switches: <strong className={tabWarnings > 0 ? 'text-yellow-300' : 'text-gray-300'}>{tabWarnings}</strong>
        </span>
        <span className="text-xs px-2.5 py-1 rounded-lg bg-white/5 border border-white/10">
          Face absence: <strong className={faceAbsenceWarnings > 0 ? 'text-orange-300' : 'text-gray-300'}>{faceAbsenceWarnings}</strong>
        </span>
      </div>

      {!hasIssues && (
        <p className="text-xs text-gray-500">
          Stay in this tab and keep your face visible. Events are flagged in real time for recruiters.
        </p>
      )}

      {liveAlerts.length > 0 && (
        <ul className="space-y-2 max-h-36 overflow-y-auto">
          {liveAlerts.map((alert) => {
            const meta = ALERT_META[alert.type] ?? ALERT_META.tab_switch
            return (
              <li
                key={alert.id}
                className={`text-xs px-3 py-2 rounded-lg border flex gap-2 items-start ${meta.className}`}
              >
                <span>{meta.icon}</span>
                <div>
                  <p className="font-medium">{meta.label}</p>
                  <p className="opacity-90 mt-0.5">{alert.message}</p>
                  <p className="opacity-60 mt-0.5">{alert.time}</p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
