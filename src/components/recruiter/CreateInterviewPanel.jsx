import { useState, useEffect } from 'react'
import {
  createRecruiterInterview,
  fetchInterviewTopics,
} from '../../lib/interview/customInterviewsApi.js'

export function CreateInterviewPanel({ onCreated, onCancel }) {
  const [title, setTitle] = useState('')
  const [durationMinutes, setDurationMinutes] = useState(25)
  const [topics, setTopics] = useState([])
  const [customQuestion, setCustomQuestion] = useState('')
  const [topicOptions, setTopicOptions] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchInterviewTopics()
      .then(setTopicOptions)
      .catch(() =>
        setTopicOptions([
          'React', 'Node.js', 'JavaScript', 'Python', 'Behavioral', 'System Design', 'UI/UX',
        ])
      )
  }, [])

  const toggleTopic = (topic) => {
    setTopics((prev) =>
      prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic]
    )
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!title.trim()) {
      setError('Enter an interview title.')
      return
    }
    if (topics.length === 0 && !customQuestion.trim()) {
      setError('Select at least one topic or add a custom question.')
      return
    }

    setSubmitting(true)
    try {
      const interview = await createRecruiterInterview({
        title: title.trim(),
        durationMinutes: Number(durationMinutes) || 25,
        topics,
        customQuestions: customQuestion.trim() ? [customQuestion.trim()] : [],
      })
      onCreated?.(interview)
      setTitle('')
      setTopics([])
      setCustomQuestion('')
    } catch (err) {
      setError(err.message ?? 'Could not create interview')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="glass-card" style={{ padding: 24, marginBottom: 24 }}>
      <h2 style={{ fontWeight: 700, fontSize: 20, color: '#e2e8f8', margin: '0 0 6px' }}>
        Create Interview
      </h2>
      <p style={{ fontSize: 13, color: '#5a6485', margin: '0 0 20px' }}>
        Choose topics for this role. Questions are auto-generated from your selection — share the invite link with candidates.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label style={{ display: 'block', fontSize: 13, color: '#8b95b8', marginBottom: 6 }}>
            Interview title
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Frontend Developer — Round 1"
            style={{
              width: '100%',
              padding: '12px 14px',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,.1)',
              background: 'rgba(0,0,0,.35)',
              color: '#e2e8f8',
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 13, color: '#8b95b8', marginBottom: 6 }}>
            Duration (minutes)
          </label>
          <input
            type="number"
            min={10}
            max={45}
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value)}
            style={{
              width: 120,
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,.1)',
              background: 'rgba(0,0,0,.35)',
              color: '#e2e8f8',
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 13, color: '#8b95b8', marginBottom: 10 }}>
            Topics to assess
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {topicOptions.map((topic) => (
              <button
                key={topic}
                type="button"
                onClick={() => toggleTopic(topic)}
                className={`ix-chip${topics.includes(topic) ? ' active' : ''}`}
                style={{ cursor: 'pointer' }}
              >
                {topic}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 13, color: '#8b95b8', marginBottom: 6 }}>
            Optional custom question
          </label>
          <textarea
            value={customQuestion}
            onChange={(e) => setCustomQuestion(e.target.value)}
            placeholder="Add one specific question you always want asked…"
            rows={2}
            style={{
              width: '100%',
              padding: '12px 14px',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,.1)',
              background: 'rgba(0,0,0,.35)',
              color: '#e2e8f8',
              resize: 'vertical',
            }}
          />
        </div>

        {error && (
          <p style={{ fontSize: 13, color: '#ff8a9a', margin: 0 }}>{error}</p>
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="submit" disabled={submitting} className="btn-primary" style={{ padding: '12px 22px' }}>
            {submitting ? 'Creating…' : 'Create & get invite link'}
          </button>
          {onCancel && (
            <button type="button" onClick={onCancel} className="btn-secondary" style={{ padding: '12px 22px' }}>
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  )
}

export function RecruiterInterviewsList({ interviews, onCopyLink, onDelete, onCreateClick }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontWeight: 700, fontSize: 22, color: '#e2e8f8', margin: 0 }}>My Interviews</h2>
          <p style={{ fontSize: 13, color: '#5a6485', marginTop: 4 }}>
            Each interview has a unique invite link — only your candidates appear in your dashboard.
          </p>
        </div>
        <button type="button" onClick={onCreateClick} className="btn-primary" style={{ fontSize: 13, padding: '10px 18px' }}>
          + Create Interview
        </button>
      </div>

      {interviews.length === 0 ? (
        <div className="glass-card" style={{ padding: 32, textAlign: 'center', color: '#5a6485' }}>
          No interviews yet. Create one to get an invite link for candidates.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {interviews.map((iv) => (
            <div key={iv.id} className="glass-card" style={{ padding: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 17, color: '#e2e8f8', marginBottom: 6 }}>{iv.title}</div>
              <div style={{ fontSize: 12, color: '#5a6485', marginBottom: 10 }}>
                {iv.durationMinutes} min · {iv.questions?.length ?? 6} questions · {iv.candidateCount ?? 0} candidates
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                {(iv.topics ?? []).slice(0, 5).map((t) => (
                  <span key={t} className="ix-chip active" style={{ fontSize: 11, padding: '4px 10px' }}>{t}</span>
                ))}
              </div>
              <div style={{ fontSize: 11, color: '#4a5580', wordBreak: 'break-all', marginBottom: 12 }}>
                Code: <strong style={{ color: '#63dca9' }}>{iv.inviteCode}</strong>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ fontSize: 12, padding: '8px 14px', flex: 1 }}
                  onClick={() => onCopyLink(iv.inviteLink ?? `/?invite=${iv.inviteCode}`, iv.title)}
                >
                  Copy invite link
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ fontSize: 12, padding: '8px 12px', color: '#ff8a9a' }}
                  onClick={() => onDelete(iv)}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
