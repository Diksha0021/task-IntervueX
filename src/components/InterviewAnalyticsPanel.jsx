export function InterviewAnalyticsPanel({ analytics, compact = false }) {
  if (!analytics) {
    return (
      <p style={{ fontSize: 13, color: '#5a6485', margin: 0 }}>
        Analytics will appear after the interview is processed.
      </p>
    )
  }

  const metrics = [
    ['Speaking time', analytics.speakingTimeFormatted ?? '—'],
    ['Total words', analytics.totalWordsSpoken ?? 0],
    ['Avg answer length', `${analytics.averageAnswerLength ?? 0} words`],
    ['Filler words', analytics.fillerWordCount ?? 0],
    ['Confidence', `${analytics.confidenceScore ?? '—'}/10`],
    ['Communication', `${analytics.communicationScore ?? '—'}/10`],
    ['Keyword match', `${analytics.keywordMatchScore ?? 0}%`],
  ]

  if (compact) {
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 11, color: '#5a6485' }}>
        {metrics.slice(0, 4).map(([label, val]) => (
          <span
            key={label}
            style={{
              background: 'rgba(255,255,255,.04)',
              border: '1px solid rgba(255,255,255,.06)',
              borderRadius: 8,
              padding: '4px 8px',
            }}
          >
            <span style={{ color: '#4a5580' }}>{label}: </span>
            <strong style={{ color: '#c8d0e8' }}>{val}</strong>
          </span>
        ))}
      </div>
    )
  }

  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 10,
          marginBottom: 14,
        }}
      >
        {metrics.map(([label, val]) => (
          <div
            key={label}
            style={{
              background: 'rgba(4,7,15,.6)',
              border: '1px solid rgba(255,255,255,.06)',
              borderRadius: 12,
              padding: '12px 10px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: '#3a4260',
                letterSpacing: '.06em',
                textTransform: 'uppercase',
                fontWeight: 600,
                marginBottom: 4,
              }}
            >
              {label}
            </div>
            <div style={{ fontWeight: 800, fontSize: compact ? 16 : 20, color: '#e2e8f8' }}>{val}</div>
          </div>
        ))}
      </div>

      {analytics.fillerWordsDetected?.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div
            style={{
              fontSize: 11,
              color: '#f5c842',
              letterSpacing: '.06em',
              textTransform: 'uppercase',
              fontWeight: 600,
              marginBottom: 6,
            }}
          >
            Top filler words
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {analytics.fillerWordsDetected.map(({ word, count }) => (
              <span
                key={word}
                className="ix-badge ix-badge-amber"
                style={{ fontSize: 11 }}
              >
                {word} ×{count}
              </span>
            ))}
          </div>
        </div>
      )}

      {analytics.keywordsMatched?.length > 0 && (
        <div>
          <div
            style={{
              fontSize: 11,
              color: '#63dca9',
              letterSpacing: '.06em',
              textTransform: 'uppercase',
              fontWeight: 600,
              marginBottom: 6,
            }}
          >
            Keywords matched ({analytics.keywordsMatched.length}/{analytics.keywordsTotal ?? '—'})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {analytics.keywordsMatched.slice(0, 12).map((kw) => (
              <span
                key={kw}
                style={{
                  fontSize: 11,
                  padding: '3px 8px',
                  borderRadius: 6,
                  background: 'rgba(99,220,169,.1)',
                  color: '#63dca9',
                  border: '1px solid rgba(99,220,169,.2)',
                }}
              >
                {kw}
              </span>
            ))}
            {analytics.keywordsMatched.length > 12 && (
              <span style={{ fontSize: 11, color: '#4a5580' }}>
                +{analytics.keywordsMatched.length - 12} more
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
