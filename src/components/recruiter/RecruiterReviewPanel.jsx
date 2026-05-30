import RecordingReplay from '../RecordingReplay.jsx'
import { InterviewAnalyticsPanel } from '../InterviewAnalyticsPanel.jsx'
import { RecruiterTranscriptViewer } from './RecruiterTranscriptViewer.jsx'
import { RecruiterProctoringSummary } from './RecruiterProctoringSummary.jsx'
import { RecruiterAIRecommendation } from './RecruiterAIRecommendation.jsx'

const sectionStyle = {
  padding: '16px 18px',
  marginBottom: 14,
}

function Section({ title, titleColor, children }) {
  return (
    <div className="glass-card" style={sectionStyle}>
      <div
        style={{
          fontSize: 11,
          color: titleColor,
          letterSpacing: '.06em',
          textTransform: 'uppercase',
          fontWeight: 600,
          marginBottom: 12,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  )
}

/**
 * Structured recruiter review: video, analytics, AI summary, proctoring, transcripts.
 */
export function RecruiterReviewPanel({ candidate, report }) {
  const analytics = candidate?.analytics ?? report?.analytics
  const recordingUrl =
    candidate?.recordingUrl ??
    (candidate?.sessionId ? `/api/recordings/${candidate.sessionId}/video` : null)

  return (
    <>
      {(candidate?.sessionId || recordingUrl || candidate?.mergeStatus) && (
        <Section title="Interview recording" titleColor="#a090ff">
          <RecordingReplay recordingUrl={recordingUrl} mergeStatus={candidate?.mergeStatus} />
        </Section>
      )}

      {analytics && (
        <Section title="Interview analytics" titleColor="#63dca9">
          <InterviewAnalyticsPanel analytics={analytics} />
        </Section>
      )}

      {report && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 14 }}>
            {[
              ['Overall', report.scores?.overall, '#63dca9'],
              ['Integrity', report.integrityScore ?? '—', (report.integrityScore ?? 10) < 6 ? '#ff5a6e' : '#63dca9'],
              ['Communication', analytics?.communicationScore ?? report.scores?.communication, '#63dca9'],
              ['Technical', report.scores?.technical, '#a090ff'],
            ].map(([label, val, col]) => (
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
                <div style={{ fontSize: 10, color: '#3a4260', letterSpacing: '.06em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>
                  {label}
                </div>
                <div style={{ fontWeight: 800, fontSize: 24, color: col }}>{val}/10</div>
              </div>
            ))}
          </div>

          <Section title="AI recommendation" titleColor="#63dca9">
            <RecruiterAIRecommendation report={report} candidate={candidate} />
          </Section>

          <Section title="Proctoring & integrity" titleColor="#f5c842">
            <RecruiterProctoringSummary report={report} candidate={candidate} />
          </Section>

          <Section title="Transcripts" titleColor="#4a5580">
            <RecruiterTranscriptViewer
              report={report}
              serverTranscript={candidate?.serverTranscript}
              transcriptionStatus={candidate?.transcriptionStatus}
              transcriptionProvider={candidate?.transcriptionProvider}
              transcriptionError={candidate?.transcriptionError}
            />
          </Section>
        </>
      )}
    </>
  )
}
