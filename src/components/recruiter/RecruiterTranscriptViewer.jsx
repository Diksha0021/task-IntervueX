import { isSubstantiveAnswer } from '../../lib/interview/answerQuality.js'

/**
 * Q&A transcript plus optional server-side recording transcript.
 */
export function RecruiterTranscriptViewer({ report, serverTranscript, transcriptionStatus, transcriptionProvider, transcriptionError }) {
  if (!report?.answers?.length && !serverTranscript && !transcriptionStatus) {
    return (
      <p style={{ fontSize: 13, color: '#5a6485', margin: 0 }}>No transcript available for this interview.</p>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {(serverTranscript || transcriptionStatus) && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 11, color: '#a090ff', letterSpacing: '.06em', textTransform: 'uppercase', fontWeight: 600 }}>
              Recording transcript
              {transcriptionProvider ? ` · ${transcriptionProvider}` : ''}
            </div>
            {transcriptionStatus && (
              <span
                className="ix-badge"
                style={{
                  fontSize: 10,
                  color:
                    transcriptionStatus === 'done'
                      ? '#63dca9'
                      : transcriptionStatus === 'failed'
                        ? '#ff5a6e'
                        : '#f5c842',
                }}
              >
                {transcriptionStatus}
              </span>
            )}
          </div>
          {transcriptionStatus === 'processing' && (
            <p style={{ fontSize: 13, color: '#5a6485', margin: '0 0 8px' }}>Transcribing merged recording…</p>
          )}
          {transcriptionStatus === 'failed' && (
            <p style={{ fontSize: 13, color: '#ff5a6e', margin: '0 0 8px' }}>
              {transcriptionError || 'Transcription failed.'}
            </p>
          )}
          {serverTranscript ? (
            <div
              style={{
                maxHeight: 220,
                overflowY: 'auto',
                fontSize: 13,
                color: '#c8d0e8',
                lineHeight: 1.7,
                whiteSpace: 'pre-wrap',
                background: 'rgba(4,7,15,.5)',
                borderRadius: 10,
                padding: '12px 14px',
                border: '1px solid rgba(255,255,255,.06)',
              }}
            >
              {serverTranscript}
            </div>
          ) : transcriptionStatus !== 'processing' ? (
            <p style={{ fontSize: 13, color: '#5a6485', margin: 0 }}>No recording transcript yet.</p>
          ) : null}
        </div>
      )}

      {report?.answers?.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: '#4a5580', letterSpacing: '.06em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 10 }}>
            Q&amp;A transcript ({report.answers.length} questions)
          </div>
          <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {report.answers.map((item, i) => {
              const ok = isSubstantiveAnswer(item.answer)
              return (
                <div key={i} style={{ borderBottom: '1px solid rgba(255,255,255,.05)', paddingBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: ok ? '#63dca9' : '#ff5a6e', marginBottom: 3 }}>
                    Q{i + 1} · {ok ? 'substantive' : 'no substantive answer'}
                  </div>
                  <div style={{ fontSize: 13, color: '#e2e8f8', marginBottom: 4, fontWeight: 500 }}>{item.question}</div>
                  <div style={{ fontSize: 13, color: '#8b95b8', lineHeight: 1.6 }}>{item.answer}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
