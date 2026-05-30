/**
 * Proctoring violations and integrity signals for recruiters.
 */
export function RecruiterProctoringSummary({ report, candidate }) {
  const tabWarnings = candidate?.tabWarnings ?? report?.tabWarnings ?? 0
  const faceAbsenceWarnings = candidate?.faceAbsenceWarnings ?? report?.faceAbsenceWarnings ?? 0
  const integrityScore = candidate?.integrityScore ?? report?.integrityScore ?? report?.scores?.integrity ?? 10
  const flagsList = candidate?.flagsList ?? report?.flags ?? []
  const proctoringLog = candidate?.proctoringLog ?? report?.proctoringLog ?? []
  const substantive = report?.substantiveAnswerCount ?? 0
  const total = report?.questionsTotal ?? 6

  const hasViolations = tabWarnings > 0 || faceAbsenceWarnings > 0 || flagsList.length > 0 || integrityScore < 7

  const metrics = [
    { label: 'Tab switches', value: tabWarnings, warn: tabWarnings > 0 },
    { label: 'Face absence', value: faceAbsenceWarnings, warn: faceAbsenceWarnings > 0 },
    { label: 'Integrity score', value: `${integrityScore}/10`, warn: integrityScore < 7 },
    { label: 'Substantive answers', value: `${substantive}/${total}`, warn: substantive < total },
  ]

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: flagsList.length || proctoringLog.length ? 14 : 0 }}>
        {metrics.map(({ label, value, warn }) => (
          <div
            key={label}
            style={{
              background: warn ? 'rgba(255,90,110,.06)' : 'rgba(4,7,15,.5)',
              border: `1px solid ${warn ? 'rgba(255,90,110,.2)' : 'rgba(255,255,255,.06)'}`,
              borderRadius: 10,
              padding: '10px 12px',
            }}
          >
            <div style={{ fontSize: 10, color: '#5a6485', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: warn ? '#ff5a6e' : '#e2e8f8' }}>{value}</div>
          </div>
        ))}
      </div>

      {!hasViolations && (
        <p style={{ fontSize: 13, color: '#63dca9', margin: '0 0 8px' }}>No proctoring violations detected.</p>
      )}

      {flagsList.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: '#f5c842', fontWeight: 600, marginBottom: 6 }}>Flags</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#c8d0e8', lineHeight: 1.6 }}>
            {flagsList.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      {proctoringLog.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: '#5a6485', fontWeight: 600, marginBottom: 6 }}>Event log</div>
          <div style={{ maxHeight: 120, overflowY: 'auto', fontSize: 12, color: '#8b95b8' }}>
            {proctoringLog.slice(0, 15).map((entry, i) => (
              <div key={i} style={{ paddingBottom: 4 }}>
                {typeof entry === 'string' ? entry : `${entry.time ?? ''} · ${entry.type ?? entry.message ?? JSON.stringify(entry)}`}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
