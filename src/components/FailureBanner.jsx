/**
 * User-facing failure / recovery banner with optional retry action.
 */
export function FailureBanner({
  message,
  severity = 'error',
  onRetry,
  retryLabel = 'Try again',
  onDismiss,
}) {
  if (!message) return null

  const styles = {
    error: {
      bg: 'rgba(255,90,110,.08)',
      border: 'rgba(255,90,110,.25)',
      color: '#ffb3be',
      icon: '⚠',
    },
    warn: {
      bg: 'rgba(245,200,66,.08)',
      border: 'rgba(245,200,66,.25)',
      color: '#ffe08a',
      icon: '◷',
    },
    info: {
      bg: 'rgba(99,220,169,.08)',
      border: 'rgba(99,220,169,.2)',
      color: '#a8f0d0',
      icon: 'ℹ',
    },
  }

  const s = styles[severity] ?? styles.error

  return (
    <div
      role="alert"
      style={{
        background: s.bg,
        border: `1px solid ${s.border}`,
        borderRadius: 14,
        padding: '14px 18px',
        marginBottom: 16,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        fontSize: 13,
        lineHeight: 1.55,
        color: s.color,
      }}
    >
      <span style={{ fontSize: 18, flexShrink: 0 }} aria-hidden>
        {s.icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0 }}>{message}</p>
        {(onRetry || onDismiss) && (
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="btn-primary"
                style={{ fontSize: 12, padding: '6px 14px' }}
              >
                {retryLabel}
              </button>
            )}
            {onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                className="btn-secondary"
                style={{ fontSize: 12, padding: '6px 14px' }}
              >
                Dismiss
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
