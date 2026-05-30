export function PipelineStatusBanner({ pipeline }) {
  if (!pipeline) return null

  const { mergeStatus, transcriptionStatus, transcriptionProgress, message } = pipeline
  const show =
    mergeStatus === 'processing' ||
    transcriptionStatus === 'processing' ||
    transcriptionStatus === 'queued' ||
    (transcriptionProgress > 0 && transcriptionProgress < 100)

  if (!show && transcriptionStatus !== 'failed') return null

  const progress = transcriptionProgress ?? 0
  const failed = transcriptionStatus === 'failed'

  return (
    <div
      className="glass-card"
      style={{
        padding: '14px 18px',
        marginBottom: 16,
        border: failed
          ? '1px solid rgba(255,90,110,.25)'
          : '1px solid rgba(160,144,255,.2)',
      }}
    >
      <div style={{ fontSize: 11, color: failed ? '#ff5a6e' : '#a090ff', letterSpacing: '.06em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 8 }}>
        {failed ? 'Processing issue' : 'Processing interview'}
      </div>
      {message && (
        <p style={{ fontSize: 13, color: '#5a6485', margin: '0 0 10px' }}>{message}</p>
      )}
      {!failed && (
        <>
          <div style={{ height: 6, borderRadius: 99, background: 'rgba(255,255,255,.06)', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${Math.min(100, Math.max(0, progress))}%`,
                background: 'linear-gradient(90deg, #63dca9, #a090ff)',
                transition: 'width .35s ease',
              }}
            />
          </div>
          <div style={{ fontSize: 11, color: '#4a5580', marginTop: 6 }}>
            Merge: {mergeStatus ?? '—'} · Transcription: {transcriptionStatus ?? '—'}
            {progress > 0 ? ` · ${progress}%` : ''}
          </div>
        </>
      )}
      {failed && pipeline.transcriptionError && (
        <p style={{ fontSize: 13, color: '#ff5a6e', margin: 0 }}>{pipeline.transcriptionError}</p>
      )}
    </div>
  )
}
