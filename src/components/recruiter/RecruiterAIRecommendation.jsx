/**
 * AI hiring recommendation and narrative summary for recruiters.
 */
export function RecruiterAIRecommendation({ report, candidate }) {
  if (!report) {
    return <p style={{ fontSize: 13, color: '#5a6485', margin: 0 }}>Report not available.</p>
  }

  const recommendation = report.recommendation ?? candidate?.recommendation ?? '—'
  const summary = report.summary ?? ''
  const strengths = report.strengths ?? []
  const improvements = report.improvements ?? []
  const recLower = recommendation.toLowerCase()

  let recColor = '#a090ff'
  if (recLower.includes('hire') || recLower.includes('strong')) recColor = '#63dca9'
  if (recLower.includes('reject') || recLower.includes('not recommend')) recColor = '#ff5a6e'
  if (recLower.includes('flag') || recLower.includes('review')) recColor = '#f5c842'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: '#5a6485', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600 }}>
          Recommendation
        </span>
        <span className="ix-badge ix-badge-violet" style={{ color: recColor, borderColor: `${recColor}44`, fontSize: 12 }}>
          {recommendation}
        </span>
        {report.durationFormatted && (
          <span style={{ fontSize: 11, color: '#4a5580' }}>
            {report.durationFormatted} · {report.completedAt}
          </span>
        )}
      </div>

      {summary && (
        <p style={{ fontSize: 14, color: '#c8d0e8', lineHeight: 1.75, margin: 0 }}>{summary}</p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {strengths.length > 0 && (
          <div style={{ background: 'rgba(99,220,169,.06)', border: '1px solid rgba(99,220,169,.15)', borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ fontSize: 11, color: '#63dca9', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em' }}>Strengths</div>
            {strengths.map((s, i) => (
              <div key={i} style={{ fontSize: 13, color: '#c8d0e8', paddingBottom: 4 }}>✓ {s}</div>
            ))}
          </div>
        )}
        {improvements.length > 0 && (
          <div style={{ background: 'rgba(245,200,66,.06)', border: '1px solid rgba(245,200,66,.15)', borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ fontSize: 11, color: '#f5c842', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em' }}>Areas to improve</div>
            {improvements.map((s, i) => (
              <div key={i} style={{ fontSize: 13, color: '#c8d0e8', paddingBottom: 4 }}>→ {s}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
