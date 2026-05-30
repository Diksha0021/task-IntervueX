import { useState, useEffect, useRef, useCallback, Component } from 'react'
import { useInterviewInfrastructure } from './hooks/useInterviewInfrastructure.js'
import { InterviewStatusBar } from './components/InterviewStatusBar.jsx'
import { ChunkRecordingPanel } from './components/ChunkRecordingPanel.jsx'
import { ProctoringAlerts } from './components/ProctoringAlerts.jsx'
import { CameraPreviewWithStream } from './components/CameraPreview.jsx'
import { AuthPage } from './components/AuthPage.jsx'
import { useAuth } from './context/AuthContext.jsx'
import { PipelineStatusBanner } from './components/PipelineStatusBanner.jsx'
import { useRecruiterRealtime } from './hooks/useRecruiterRealtime.js'
import { useVoiceAssistant } from './hooks/useVoiceAssistant.js'
import { RecruiterReviewPanel } from './components/recruiter/RecruiterReviewPanel.jsx'
import { FailureBanner } from './components/FailureBanner.jsx'
import { RealtimeEvents } from './lib/realtime/events.js'
import {
  INTERVIEW_PROFILES,
  getProfileById,
  getQuestionTexts,
  formatDuration,
} from './lib/interview/interviewProfiles.js'
import {
  generateInterviewReport,
  formatReportForDownload,
  isCandidateFlagged,
  getCandidateDisplayStatus,
} from './lib/interview/report.js'
import {
  fetchRecruiterCandidates,
  updateRecruiterDecision,
  removeRecruiterCandidate,
} from './lib/interview/reportsApi.js'
import {
  saveActiveRoute,
  clearActiveRoute,
  loadActiveRoute,
} from './lib/interview/sessionStorage.js'
import { resolveQuestionIndex } from './lib/interview/interviewRecovery.js'

/* ─── Inject global styles once ─── */
const IX_STYLES = `
  *, *::before, *::after { box-sizing: border-box; }

  body {
    margin: 0;
    background: #04070f;
    color: #e2e8f8;
    font-family: 'Outfit', sans-serif;
    -webkit-font-smoothing: antialiased;
  }

  /* ── Keyframes ── */
  @keyframes ix-fadeup   { from { opacity:0; transform:translateY(20px) } to { opacity:1; transform:translateY(0) } }
  @keyframes ix-spin     { to   { transform:rotate(360deg) } }
  @keyframes ix-wave     { 0%,100%{height:4px} 50%{height:20px} }
  @keyframes ix-blink    { 0%,100%{opacity:1} 50%{opacity:.2} }
  @keyframes ix-pulse    { 0%,100%{box-shadow:0 0 0 0 rgba(99,220,169,.45)} 70%{box-shadow:0 0 0 10px rgba(99,220,169,0)} }
  @keyframes ix-scan     { 0%{top:-3px} 100%{top:102%} }
  @keyframes ix-orbA     { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(30px,-20px) scale(1.05)} }
  @keyframes ix-orbB     { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-20px,30px) scale(1.08)} }
  @keyframes ix-shimmer  { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
  @keyframes ix-glow-in  { from{opacity:0;filter:blur(6px)} to{opacity:1;filter:blur(0)} }
  @keyframes ix-tick     { from{opacity:0;transform:scale(.7)} to{opacity:1;transform:scale(1)} }

  /* ── Utility animations ── */
  .ix-fadeup   { animation: ix-fadeup .5s cubic-bezier(.22,1,.36,1) forwards; }
  .ix-delay-1  { animation-delay:.08s; }
  .ix-delay-2  { animation-delay:.16s; }
  .ix-delay-3  { animation-delay:.24s; }
  .ix-glow-in  { animation: ix-glow-in .6s ease forwards; }
  .ix-spin     { animation: ix-spin .75s linear infinite; }

  /* ── Wave bars ── */
  .wave-bar {
    display: inline-block;
    width: 3px;
    border-radius: 99px;
    background: #63dca9;
    animation: ix-wave .7s ease-in-out infinite;
    min-height: 4px;
  }

  /* ── Orb BG ── */
  .ix-orbs {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    z-index: 0;
  }
  .ix-orb {
    position: absolute;
    border-radius: 50%;
    filter: blur(80px);
    opacity: .55;
  }
  .ix-orb-a {
    width: 520px; height: 520px;
    background: radial-gradient(circle, rgba(99,220,169,.18), transparent 70%);
    top: -120px; left: -180px;
    animation: ix-orbA 9s ease-in-out infinite;
  }
  .ix-orb-b {
    width: 480px; height: 480px;
    background: radial-gradient(circle, rgba(120,100,255,.15), transparent 70%);
    bottom: -100px; right: -160px;
    animation: ix-orbB 11s ease-in-out infinite;
  }
  .ix-orb-c {
    width: 300px; height: 300px;
    background: radial-gradient(circle, rgba(99,220,169,.09), transparent 70%);
    top: 40%; left: 50%;
    animation: ix-orbA 7s ease-in-out infinite reverse;
  }
  .ix-grid-dots {
    position: absolute;
    inset: 0;
    background-image: radial-gradient(rgba(255,255,255,.045) 1px, transparent 1px);
    background-size: 28px 28px;
    pointer-events: none;
  }

  /* ── Scan line ── */
  .assistant-speaking {
    animation: ix-pulse 1.8s ease-in-out infinite;
  }
  .assistant-listening::after {
    content: '';
    position: absolute;
    left: 0; right: 0;
    height: 2px;
    background: linear-gradient(90deg, transparent, #63dca9 40%, transparent);
    animation: ix-scan 2s linear infinite;
    top: 0;
  }

  /* ── NAV ── */
  .ix-nav {
    position: relative;
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 36px;
    height: 66px;
    background: rgba(4,7,15,.85);
    backdrop-filter: blur(20px);
    border-bottom: 1px solid rgba(255,255,255,.07);
  }

  /* ── Logo ── */
  .ix-logo-mark {
    width: 44px; height: 38px;
    border-radius: 11px;
    background: linear-gradient(135deg, #63dca9, #7864ff);
    display: flex; align-items: center; justify-content: center;
    font-weight: 800; font-size: 14px; letter-spacing: -0.04em; color: #04070f;
    flex-shrink: 0;
    box-shadow: 0 0 18px rgba(99,220,169,.35);
  }
  .ix-logo-name {
    font-size: 20px;
    font-weight: 800;
    letter-spacing: -.03em;
    color: #e2e8f8;
    line-height: 1;
  }
  .ix-logo-name span { color: #63dca9; }
  .ix-logo-sub {
    font-size: 10px;
    color: #4a5580;
    letter-spacing: .1em;
    text-transform: uppercase;
    margin-top: 2px;
  }

  /* ── Buttons ── */
  .btn-primary {
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    padding: 11px 24px;
    border-radius: 10px;
    background: #63dca9;
    color: #04070f;
    font-family: 'Outfit', sans-serif;
    font-weight: 700;
    font-size: 14px;
    cursor: pointer;
    border: none;
    transition: all .2s ease;
    box-shadow: 0 0 20px rgba(99,220,169,.3);
    white-space: nowrap;
  }
  .btn-primary:hover:not(:disabled) {
    background: #7ae8b8;
    box-shadow: 0 0 32px rgba(99,220,169,.5);
    transform: translateY(-1px);
  }
  .btn-primary:active:not(:disabled) { transform: scale(.97); }
  .btn-primary:disabled { opacity: .4; cursor: not-allowed; }

  .btn-secondary {
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    padding: 10px 20px;
    border-radius: 10px;
    background: rgba(255,255,255,.06);
    color: #c8d0e8;
    font-family: 'Outfit', sans-serif;
    font-weight: 500;
    font-size: 14px;
    cursor: pointer;
    border: 1px solid rgba(255,255,255,.1);
    transition: all .18s ease;
    white-space: nowrap;
  }
  .btn-secondary:hover:not(:disabled) {
    background: rgba(255,255,255,.11);
    border-color: rgba(255,255,255,.18);
    color: #e2e8f8;
  }
  .btn-secondary:disabled { opacity: .35; cursor: not-allowed; }

  /* ── Cards ── */
  .glass-card {
    background: rgba(12,18,36,.75);
    border: 1px solid rgba(255,255,255,.08);
    border-radius: 18px;
    backdrop-filter: blur(12px);
  }
  .glass-card-hover {
    transition: transform .2s ease, border-color .2s ease, box-shadow .2s ease;
  }
  .glass-card-hover:hover {
    transform: translateY(-4px);
    border-color: rgba(99,220,169,.22);
    box-shadow: 0 12px 40px rgba(0,0,0,.35);
  }

  /* ── Gradient text ── */
  .gradient-text {
    background: linear-gradient(135deg, #63dca9 0%, #9bf0c8 50%, #7864ff 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  /* ── Grid BG ── */
  .grid-bg {
    background-image:
      linear-gradient(rgba(255,255,255,.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,.03) 1px, transparent 1px);
    background-size: 44px 44px;
  }

  /* ── Glow orb (positional) ── */
  .glow-orb {
    position: absolute;
    border-radius: 50%;
    filter: blur(88px);
    pointer-events: none;
    opacity: .5;
  }

  /* ── Progress bar ── */
  .progress-bar {
    background: linear-gradient(90deg, #63dca9, #7864ff);
  }

  /* ── Animate pulse soft ── */
  .animate-pulse-soft { animation: ix-blink 2s ease-in-out infinite; }

  /* ── Slide-up / fade-in ── */
  .animate-slide-up { animation: ix-fadeup .55s cubic-bezier(.22,1,.36,1) both; }
  .animate-fade-in  { animation: ix-glow-in .4s ease both; }

  /* ── Modal overlay ── */
  .ix-modal-overlay {
    position: fixed; inset: 0; z-index: 200;
    background: rgba(2,4,12,.82);
    backdrop-filter: blur(10px);
    display: flex; align-items: center; justify-content: center;
    padding: 20px;
    animation: ix-glow-in .2s ease;
  }
  .ix-modal-box {
    background: #0b1123;
    border: 1px solid rgba(255,255,255,.1);
    border-radius: 22px;
    padding: 36px;
    max-height: 90vh;
    overflow-y: auto;
    animation: ix-fadeup .25s cubic-bezier(.22,1,.36,1);
  }

  /* ── Status dot ── */
  .ix-dot {
    width: 9px; height: 9px;
    border-radius: 50%;
    display: inline-block;
  }
  .ix-dot-green  { background: #63dca9; box-shadow: 0 0 8px rgba(99,220,169,.7); }
  .ix-dot-yellow { background: #f5c842; box-shadow: 0 0 8px rgba(245,200,66,.7); animation: ix-blink 1.4s ease infinite; }
  .ix-dot-red    { background: #ff5a6e; box-shadow: 0 0 8px rgba(255,90,110,.7); }
  .ix-dot-gray   { background: #3a4260; }

  /* ── Badge ── */
  .ix-badge {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 3px 11px; border-radius: 99px;
    font-size: 11px; font-weight: 600; letter-spacing: .05em;
    text-transform: uppercase;
  }
  .ix-badge-teal   { background: rgba(99,220,169,.12); color: #63dca9; border: 1px solid rgba(99,220,169,.22); }
  .ix-badge-violet { background: rgba(120,100,255,.12); color: #a090ff; border: 1px solid rgba(120,100,255,.22); }
  .ix-badge-amber  { background: rgba(245,200,66,.1); color: #f5c842; border: 1px solid rgba(245,200,66,.2); }
  .ix-badge-red    { background: rgba(255,90,110,.1); color: #ff5a6e; border: 1px solid rgba(255,90,110,.2); }
  .ix-badge-gray   { background: rgba(255,255,255,.05); color: #6a7495; border: 1px solid rgba(255,255,255,.08); }

  /* ── REC indicator ── */
  .ix-rec {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 5px 13px; border-radius: 99px;
    background: rgba(255,90,110,.13);
    border: 1px solid rgba(255,90,110,.28);
    color: #ff5a6e;
    font-size: 12px; font-weight: 700; letter-spacing: .06em;
  }
  .ix-rec-dot {
    width: 7px; height: 7px; border-radius: 50%;
    background: #ff5a6e;
    animation: ix-blink 1.2s ease infinite;
  }

  /* ── Filter chips ── */
  .ix-chip {
    padding: 7px 18px;
    border-radius: 99px;
    font-size: 13px; font-weight: 500;
    cursor: pointer; transition: all .18s;
    border: 1px solid rgba(255,255,255,.09);
    background: transparent; color: #5a6485;
    font-family: 'Outfit', sans-serif;
  }
  .ix-chip:hover { color: #c8d0e8; border-color: rgba(255,255,255,.17); }
  .ix-chip.active {
    background: #63dca9; color: #04070f;
    border-color: #63dca9; font-weight: 700;
    box-shadow: 0 0 16px rgba(99,220,169,.4);
  }

  /* ── Scrollbar ── */
  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #1e2540; border-radius: 99px; }

  /* ── Mono text ── */
  .ix-mono { font-family: 'JetBrains Mono', monospace; }

  /* ── Shimmer loading ── */
  .ix-shimmer {
    background: linear-gradient(90deg, #0e1525 25%, #1a2440 50%, #0e1525 75%);
    background-size: 400% 100%;
    animation: ix-shimmer 2s ease infinite;
  }

  /* ── Q number watermark ── */
  .ix-q-watermark {
    position: absolute; right: 18px; bottom: -10px;
    font-size: 88px; font-weight: 800; color: rgba(255,255,255,.04);
    line-height: 1; pointer-events: none; user-select: none;
    letter-spacing: -.04em;
  }

  /* ── Stat card ── */
  .ix-stat {
    background: rgba(10,16,32,.8);
    border: 1px solid rgba(255,255,255,.07);
    border-radius: 14px;
    padding: 18px 20px;
    transition: border-color .2s;
  }
  .ix-stat:hover { border-color: rgba(99,220,169,.2); }
  .ix-stat-label {
    font-size: 11px; color: #4a5580; letter-spacing: .07em;
    text-transform: uppercase; font-weight: 600; margin-bottom: 8px;
  }
  .ix-stat-value {
    font-size: 32px; font-weight: 800; letter-spacing: -.03em; line-height: 1;
  }

  /* ── Candidate card status borders ── */
  .cand-approved { border-color: rgba(99,220,169,.3) !important; background: rgba(99,220,169,.04) !important; }
  .cand-rejected { border-color: rgba(255,90,110,.3) !important; background: rgba(255,90,110,.04) !important; }
  .cand-flagged  { border-color: rgba(245,200,66,.3) !important; background: rgba(245,200,66,.04) !important; }

  /* ── Progress bar base ── */
  .ix-progress { height: 4px; border-radius: 99px; background: rgba(255,255,255,.07); overflow: hidden; }
  .ix-progress-fill { height: 100%; border-radius: 99px; transition: width .6s ease; }
  .ix-progress-teal   { background: linear-gradient(90deg, #63dca9, #9bf0c8); }
  .ix-progress-violet { background: linear-gradient(90deg, #7864ff, #a090ff); }
  .ix-progress-amber  { background: linear-gradient(90deg, #f5c842, #ffe08a); }
`

function InjectStyles() {
  useEffect(() => {
    const id = 'interviewx-styles'
    if (document.getElementById(id)) return
    const el = document.createElement('style')
    el.id = id
    el.textContent = IX_STYLES
    document.head.appendChild(el)
  }, [])
  return null
}

/* ─── Constants ─── */
const ASSISTANT_NAME = 'IntervueX'

const FEATURES = [
  {
    title: 'Resilient Chunk Streaming',
    desc: '3-second WebM segments upload in the background with offline queueing, deduplication, and automatic retry when the network returns.',
    icon: '📡',
  },
  {
    title: 'Voice-Guided Interviews',
    desc: 'AI interviewer reads each question aloud and captures spoken answers with live transcript preview before you submit.',
    icon: '🎙️',
  },
  {
    title: 'Smart Proctoring',
    desc: 'Tab-switch detection, face-presence monitoring, and camera disconnect alerts with a live integrity event log.',
    icon: '🛡️',
  },
  {
    title: 'Interview Analytics',
    desc: 'Speaking time, filler words, confidence score, and role keyword match — generated automatically for recruiters.',
    icon: '📊',
  },
  {
    title: 'Recording + Transcription',
    desc: 'Chunks merge into a full replay; optional Whisper or Deepgram transcript alongside structured Q&A.',
    icon: '🤖',
  },
  {
    title: 'Recruiter Command Center',
    desc: 'Live dashboard updates, video replay, proctoring summary, AI recommendation, and one-click approve or reject.',
    icon: '⚡',
  },
]

const HOW_IT_WORKS = [
  { step: '01', title: 'Pick a role profile', desc: 'Six structured questions tailored to the track (~25 min).' },
  { step: '02', title: 'Verify camera & mic', desc: 'Hardware check and live preview before the session starts.' },
  { step: '03', title: 'Answer with your voice', desc: 'AI reads each question; submit when ready — recording runs continuously.' },
  { step: '04', title: 'Review & decide', desc: 'Recruiters get video, transcripts, analytics, and integrity flags in one view.' },
]

function buildQuestionSpeech(index, questions, profile) {
  const question = questions[index]
  const total = questions.length
  const mins = profile.durationMinutes
  if (index === 0) {
    return `Hello! I'm ${ASSISTANT_NAME}, your AI interview assistant for the ${profile.title} interview. `
      + `We'll cover ${total} questions in about ${mins} minutes — 2 behavioral and ${total - 2} focused on this role. `
      + `Take your time, then click Submit Answer. Question 1: ${question}`
  }
  if (index === total - 1) {
    return `Thank you for that answer. Here is your final question, number ${index + 1}: ${question}`
  }
  return `Thank you. Question ${index + 1} of ${total}: ${question}`
}

/* ─── Voice Assistant Panel ─── */
function VoiceAssistantPanel({
  state,
  transcript,
  interimTranscript,
  supported,
  recognitionError,
  onRepeat,
  onRestartMic,
}) {
  const statusMap = {
    speaking: { label: `${ASSISTANT_NAME} is speaking...`, color: '#a090ff' },
    listening: { label: 'Listening to your answer...', color: '#63dca9' },
    idle:     { label: 'Ready', color: '#4a5580' },
  }
  const { label, color } = statusMap[state] || statusMap.idle
  const fullTranscript = `${transcript}${interimTranscript}`.trim()
  const isListening = state === 'listening'
  const isSpeaking  = state === 'speaking'

  return (
    <div className="glass-card" style={{
      padding: '22px',
      borderColor: isListening ? 'rgba(99,220,169,.28)' : isSpeaking ? 'rgba(120,100,255,.28)' : undefined,
      transition: 'border-color .3s',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
        {/* Avatar */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div
            className={isSpeaking ? 'assistant-speaking' : ''}
            style={{
              width: 56, height: 56, borderRadius: 16,
              background: isSpeaking
                ? 'linear-gradient(135deg,#7864ff,#a090ff)'
                : 'linear-gradient(135deg,#63dca9,#0f6e56)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 17, fontWeight: 800, color: '#04070f', letterSpacing: '-0.04em',
              boxShadow: isListening ? '0 0 18px rgba(99,220,169,.45)' : isSpeaking ? '0 0 18px rgba(120,100,255,.45)' : 'none',
              transition: 'all .3s',
            }}
          >iX</div>
          {isListening && (
            <div style={{ position: 'absolute', bottom: -10, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'flex-end', gap: 2, height: 22 }}>
              {[0,1,2,3,4].map(i => (
                <span key={i} className="wave-bar" style={{ animationDelay: `${i * .12}s` }} />
              ))}
            </div>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontWeight: 700, fontSize: 16 }}>{ASSISTANT_NAME}</span>
            <span className="ix-badge ix-badge-teal" style={{ fontSize: 10 }}>AI Interviewer</span>
          </div>
          <div style={{ fontSize: 13, color, transition: 'color .3s' }}>{label}</div>
        </div>
      </div>

      {/* Transcript box */}
      <div style={{
        background: 'rgba(4,7,15,.7)', border: '1px solid rgba(255,255,255,.06)',
        borderRadius: 12, padding: '13px 15px', minHeight: 90, marginBottom: 14,
      }}>
        <div style={{ fontSize: 10, color: '#3a4260', letterSpacing: '.07em', textTransform: 'uppercase', marginBottom: 6, fontWeight: 600 }}>
          Live Transcript
        </div>
        {fullTranscript ? (
          <p style={{ fontSize: 14, lineHeight: 1.7, color: '#c8d0e8', margin: 0 }}>
            {transcript}<span style={{ color: '#4a5580' }}>{interimTranscript}</span>
          </p>
        ) : (
          <p style={{ fontSize: 13, color: '#2a3348', fontStyle: 'italic', margin: 0 }}>
            {isListening ? 'Start speaking — your words appear here...' : 'Waiting for the question...'}
          </p>
        )}
      </div>

      {recognitionError && (
        <p style={{ fontSize: 12, color: '#ff5a6e', margin: '0 0 12px', lineHeight: 1.5 }}>
          {recognitionError}
        </p>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={onRepeat} disabled={isSpeaking} className="btn-secondary" style={{ fontSize: 13, padding: '8px 16px' }}>
          ↺ Repeat Question
        </button>
        {!isSpeaking && state !== 'listening' && onRestartMic && (
          <button
            type="button"
            onClick={onRestartMic}
            className="btn-secondary"
            style={{ fontSize: 13, padding: '8px 16px', borderColor: 'rgba(99,220,169,.35)', color: '#63dca9' }}
          >
            🎤 Start microphone
          </button>
        )}
        {!supported.speech && (
          <span style={{ fontSize: 12, color: '#f5c842' }}>⚠ TTS not supported</span>
        )}
        {!supported.recognition && (
          <span style={{ fontSize: 12, color: '#f5c842' }}>⚠ Use Chrome or Edge for voice input</span>
        )}
      </div>
    </div>
  )
}

/* ─── Background Orbs ─── */
function BackgroundDecor() {
  return (
    <>
      <div className="ix-orbs">
        <div className="ix-orb ix-orb-a" />
        <div className="ix-orb ix-orb-b" />
        <div className="ix-orb ix-orb-c" />
        <div className="ix-grid-dots" />
      </div>
    </>
  )
}

/* ─── Modal ─── */
function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null
  return (
    <div className="ix-modal-overlay" onClick={onClose}>
      <div
        className="ix-modal-box"
        style={{ width: '100%', maxWidth: wide ? 780 : 520 }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h2 className="gradient-text" style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>{title}</h2>
          <button onClick={onClose} className="btn-secondary" style={{ width: 36, height: 36, padding: 0, borderRadius: '50%' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

/* ─── Toast ─── */
function Toast({ message, type = 'info', onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000); return () => clearTimeout(t)
  }, [onClose])
  const colors = {
    info:    { bg: 'rgba(12,18,36,.95)', border: 'rgba(99,220,169,.25)', color: '#c8d0e8' },
    success: { bg: 'rgba(5,20,14,.95)', border: 'rgba(99,220,169,.4)', color: '#63dca9' },
    error:   { bg: 'rgba(20,5,10,.95)', border: 'rgba(255,90,110,.4)', color: '#ff5a6e' },
    warning: { bg: 'rgba(20,16,5,.95)', border: 'rgba(245,200,66,.35)', color: '#f5c842' },
  }
  const c = colors[type] || colors.info
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      padding: '13px 20px', borderRadius: 13, minWidth: 260,
      background: c.bg, border: `1px solid ${c.border}`, color: c.color,
      fontSize: 14, fontWeight: 500, backdropFilter: 'blur(16px)',
      animation: 'ix-fadeup .3s cubic-bezier(.22,1,.36,1)',
    }}>
      {message}
    </div>
  )
}

/* ─── Progress Bar ─── */
function ProgressBar({ value, max = 10, color = 'teal' }) {
  const fillClass =
    color === 'violet' ? 'ix-progress-violet' : color === 'amber' ? 'ix-progress-amber' : 'ix-progress-teal'
  return (
    <div className="ix-progress">
      <div
        className={`ix-progress-fill ${fillClass}`}
        style={{ width: `${Math.min(100, (value / max) * 100)}%` }}
      />
    </div>
  )
}

/* ─── Media Devices ─── */
function useMediaDevices() {
  const [micStatus, setMicStatus] = useState('checking')
  const [camStatus, setCamStatus] = useState('checking')

  const checkDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const hasMic = devices.some(d => d.kind === 'audioinput')
      const hasCam = devices.some(d => d.kind === 'videoinput')
      setMicStatus(!hasMic ? 'unavailable' : devices.some(d => d.kind === 'audioinput' && d.label) ? 'connected' : 'checking')
      setCamStatus(!hasCam ? 'unavailable' : devices.some(d => d.kind === 'videoinput' && d.label) ? 'connected' : 'checking')
    } catch { setMicStatus('unavailable'); setCamStatus('unavailable') }
  }, [])

  const reportStream = useCallback((stream) => {
    if (!stream) return
    if (stream.getVideoTracks().some(t => t.readyState === 'live')) setCamStatus('connected')
    if (stream.getAudioTracks().some(t => t.readyState === 'live')) setMicStatus('connected')
  }, [])
  const reportStreamEnded = useCallback((hadAudio = false) => { setCamStatus('checking'); if (hadAudio) setMicStatus('checking') }, [])
  const reportPermissionDenied = useCallback((hadAudio = false) => { setCamStatus('denied'); if (hadAudio) setMicStatus('denied') }, [])

  return { micStatus, camStatus, checkDevices, reportStream, reportStreamEnded, reportPermissionDenied }
}

/* ─── Status Dot ─── */
function StatusDot({ status }) {
  const map = {
    checking:    { cls: 'ix-dot ix-dot-yellow', label: 'Checking...' },
    connected:   { cls: 'ix-dot ix-dot-green',  label: 'Connected' },
    denied:      { cls: 'ix-dot ix-dot-red',     label: 'Permission Denied' },
    unavailable: { cls: 'ix-dot ix-dot-gray',    label: 'Not Found' },
  }
  const { cls, label } = map[status] || map.unavailable
  const labelColor = status === 'connected' ? '#63dca9' : status === 'denied' ? '#ff5a6e' : '#4a5580'
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span className={cls} />
      <span style={{ fontSize: 13, color: labelColor }}>{label}</span>
    </span>
  )
}

/* ─── Candidate status helpers ─── */
function getCandidateStatusStyle(status) {
  if (status === 'Approved') return {
    card: 'cand-approved',
    badge: 'ix-badge ix-badge-teal',
    avatar: 'linear-gradient(135deg,#63dca9,#0f6e56)',
    icon: '✓',
  }
  if (status === 'Rejected') return {
    card: 'cand-rejected',
    badge: 'ix-badge ix-badge-red',
    avatar: 'linear-gradient(135deg,#ff5a6e,#7a1520)',
    icon: '✕',
  }
  if (status === 'Flagged') return {
    card: 'cand-flagged',
    badge: 'ix-badge ix-badge-amber',
    avatar: 'linear-gradient(135deg,#f5c842,#7a5010)',
    icon: '⚑',
  }
  return {
    card: '',
    badge: 'ix-badge ix-badge-gray',
    avatar: 'linear-gradient(135deg,#7864ff,#63dca9)',
    icon: '◉',
  }
}

function CandidateStatusBadge({ status }) {
  const s = getCandidateStatusStyle(status)
  return <span className={s.badge}><span>{s.icon}</span>{status}</span>
}

/* ─── Demo Modal ─── */
function DemoModal({ open, onClose, onTryDemo }) {
  const [step, setStep] = useState(0)
  const demoSteps = [
    { title: 'Welcome', text: 'IntervueX automates your entire first-round interview pipeline.', icon: '👋' },
    { title: 'Recording', text: 'Candidates are recorded in HD while AI transcribes every answer in real time.', icon: '🎬' },
    { title: 'Proctoring', text: 'Our system flags tab switches, multiple faces, and suspicious activity automatically.', icon: '🔍' },
    { title: 'Analytics', text: 'Recruiters get scored reports, transcripts, and flagged moments — ready to review.', icon: '📊' },
  ]
  useEffect(() => { if (open) setStep(0) }, [open])

  return (
    <Modal open={open} onClose={onClose} title="Platform Demo" wide>
      <div style={{ marginBottom: 20 }}>
        <div style={{
          borderRadius: 16,
          background: 'linear-gradient(135deg, rgba(99,220,169,.07), rgba(120,100,255,.07))',
          border: '1px solid rgba(255,255,255,.07)',
          padding: '44px 28px',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>{demoSteps[step].icon}</div>
          <h3 style={{ fontWeight: 800, fontSize: 20, marginBottom: 10, color: '#e2e8f8' }}>{demoSteps[step].title}</h3>
          <p style={{ color: '#5a6485', maxWidth: 340, margin: '0 auto', lineHeight: 1.7 }}>{demoSteps[step].text}</p>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 20 }}>
        {demoSteps.map((_, i) => (
          <button key={i} onClick={() => setStep(i)} style={{
            width: i === step ? 26 : 8, height: 8, borderRadius: 99,
            background: i === step ? '#63dca9' : 'rgba(255,255,255,.1)',
            border: 'none', cursor: 'pointer', padding: 0, transition: 'all .3s',
          }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button disabled={step === 0} onClick={() => setStep(s => s - 1)} className="btn-secondary" style={{ flex: 1 }}>← Previous</button>
        {step < demoSteps.length - 1
          ? <button onClick={() => setStep(s => s + 1)} className="btn-primary" style={{ flex: 1 }}>Next →</button>
          : <button onClick={() => { onClose(); onTryDemo() }} className="btn-primary" style={{ flex: 1 }}>Try It Yourself →</button>
        }
      </div>
    </Modal>
  )
}

/* ─── Review Modal ─── */
function ReviewModal({ open, onClose, candidate, onAction, onRemove }) {
  if (!candidate) return null
  const report = candidate.report
  const displayStatus = getCandidateDisplayStatus(candidate)
  const statusStyle = getCandidateStatusStyle(displayStatus)

  const downloadReport = () => {
    if (!report) return
    const text = formatReportForDownload(report)
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `interviewx-${candidate.name.replace(/\s+/g, '-')}.txt`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Modal open={open} onClose={onClose} title={`Review — ${candidate.name}`} wide>
      <div style={{ maxHeight: '70vh', overflowY: 'auto', paddingRight: 4 }}>
        {/* Identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 22 }}>
          <div style={{
            width: 58, height: 58, borderRadius: 16,
            background: statusStyle.avatar,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, fontWeight: 800, color: '#04070f', flexShrink: 0,
          }}>{candidate.name.charAt(0)}</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 17, color: '#e2e8f8' }}>{candidate.name}</div>
            <div style={{ fontSize: 13, color: '#5a6485', marginTop: 2 }}>{candidate.email} · {candidate.role}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              <CandidateStatusBadge status={displayStatus} />
              {report?.recommendation && <span className="ix-badge ix-badge-violet">{report.recommendation}</span>}
            </div>
          </div>
        </div>

        <RecruiterReviewPanel candidate={candidate} report={report} />

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', position: 'sticky', bottom: 0, background: '#0b1123', paddingTop: 14, paddingBottom: 4 }}>
          {report && <button onClick={downloadReport} className="btn-secondary" style={{ fontSize: 13 }}>↓ Download</button>}
          <button onClick={() => onAction('approve', candidate.id)} className="btn-primary" style={{ flex: 1, background: 'rgba(99,220,169,.15)', color: '#63dca9', boxShadow: 'none', border: '1px solid rgba(99,220,169,.3)' }}>✓ Approve</button>
          <button onClick={() => onAction('reject', candidate.id)} className="btn-primary" style={{ flex: 1, background: 'rgba(255,90,110,.13)', color: '#ff5a6e', boxShadow: 'none', border: '1px solid rgba(255,90,110,.28)' }}>✕ Reject</button>
          <button onClick={() => onRemove?.(candidate)} style={{ width: '100%', background: 'none', border: '1px solid rgba(255,255,255,.07)', borderRadius: 10, padding: '9px', cursor: 'pointer', color: '#4a5580', fontSize: 13, fontFamily: 'Outfit,sans-serif', marginTop: 2 }}>Remove from list</button>
        </div>
      </div>
    </Modal>
  )
}

/* ─────────────────────────────────────────────
   LANDING PAGE
───────────────────────────────────────────── */
function LandingPage({ setPage, onWatchDemo, micStatus, camStatus, checkDevices, reportStream, reportStreamEnded, reportPermissionDenied, user, onLogout }) {
  const dashboardPage = user?.role === 'recruiter' ? 'recruiter' : 'user'

  return (
    <div style={{ minHeight: '100vh', background: '#04070f', position: 'relative', overflow: 'hidden' }}>
      <BackgroundDecor />

      {/* Nav */}
      <nav className="ix-nav">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="ix-logo-mark">iX</div>
          <div>
            <div className="ix-logo-name">Intervue<span>X</span></div>
            {user && <div className="ix-logo-sub">{user.name} · {user.role === 'recruiter' ? 'Recruiter' : 'Candidate'}</div>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setPage(dashboardPage)} className="btn-primary" style={{ fontSize: 13, padding: '9px 20px' }}>
            {user?.role === 'recruiter' ? 'Recruiter Dashboard' : 'My Dashboard'}
          </button>
          <button onClick={onLogout} className="btn-secondary" style={{ fontSize: 13, padding: '9px 20px' }}>Sign out</button>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ position: 'relative', zIndex: 1, maxWidth: 1180, margin: '0 auto', padding: '72px 36px 60px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 56, alignItems: 'center' }}>
        <div className="animate-slide-up">
          <div className="ix-badge ix-badge-teal" style={{ marginBottom: 22 }}>⚡ Next-Gen Hiring Platform</div>
          <h1 style={{ fontWeight: 800, fontSize: 58, lineHeight: 1.05, letterSpacing: '-.03em', marginBottom: 20, color: '#e2e8f8' }}>
            AI-Powered<br /><span className="gradient-text">Video Interview</span><br />Platform
          </h1>
          <p style={{ color: '#5a6485', fontSize: 17, lineHeight: 1.75, marginBottom: 36, maxWidth: 430 }}>
            Automate first-round interviews with real-time recording, AI transcripts, intelligent proctoring, and recruiter analytics.
          </p>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 48 }}>
            <button onClick={() => setPage(dashboardPage)} className="btn-primary" style={{ padding: '13px 32px', fontSize: 15 }}>
              {user?.role === 'recruiter' ? 'Open Dashboard →' : 'Start Interview →'}
            </button>
            <button onClick={onWatchDemo} className="btn-secondary" style={{ padding: '13px 28px', fontSize: 15 }}>▶ Watch Demo</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 28 }}>
            {['Chunk-safe recording', 'Session recovery', 'Live proctoring', 'Recruiter analytics'].map((tag) => (
              <span key={tag} className="ix-badge ix-badge-teal" style={{ fontSize: 11, padding: '6px 12px' }}>{tag}</span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 36 }}>
            {[['6','Questions / session'],['25min','Avg. session'],['99.2%','Upload reliability']].map(([v,l]) => (
              <div key={l}>
                <div style={{ fontWeight: 800, fontSize: 30, color: '#63dca9', letterSpacing: '-.03em' }}>{v}</div>
                <div style={{ fontSize: 12, color: '#4a5580', marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Camera card */}
        <div className="glass-card animate-slide-up" style={{ padding: '22px', animationDelay: '.1s' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13 }}>
            <span style={{ fontSize: 12, color: '#4a5580' }}>Live Preview — Test Your Setup</span>
            <div className="ix-rec"><div className="ix-rec-dot" />LIVE</div>
          </div>
          <CameraPreviewWithStream audio showControls showRec
            onStreamReady={reportStream}
            onStreamEnd={() => reportStreamEnded(true)}
            onPermissionDenied={() => reportPermissionDenied(true)}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
            {[['🎤 Microphone', micStatus],['📷 Camera', camStatus]].map(([label, status]) => (
              <div key={label} style={{ background: 'rgba(4,7,15,.6)', borderRadius: 11, padding: '11px 13px', border: '1px solid rgba(255,255,255,.06)' }}>
                <div style={{ fontSize: 12, color: '#4a5580', marginBottom: 7 }}>{label}</div>
                <StatusDot status={status} />
              </div>
            ))}
          </div>
          <button onClick={checkDevices} className="btn-secondary" style={{ marginTop: 10, width: '100%', fontSize: 12 }}>↻ Re-check devices</button>
        </div>
      </section>

      {/* How it works */}
      <section style={{ position: 'relative', zIndex: 1, maxWidth: 1180, margin: '0 auto', padding: '0 36px 56px' }}>
        <h2 style={{ fontWeight: 800, fontSize: 32, textAlign: 'center', marginBottom: 10, color: '#e2e8f8' }}>How it works</h2>
        <p style={{ color: '#4a5580', textAlign: 'center', marginBottom: 36, fontSize: 15 }}>From device check to hiring decision — one continuous workflow.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
          {HOW_IT_WORKS.map((item) => (
            <div key={item.step} className="glass-card" style={{ padding: '22px 20px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#63dca9', letterSpacing: '.08em', marginBottom: 10 }}>{item.step}</div>
              <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 8, color: '#e2e8f8' }}>{item.title}</h3>
              <p style={{ fontSize: 13, color: '#5a6485', lineHeight: 1.65, margin: 0 }}>{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section style={{ position: 'relative', zIndex: 1, maxWidth: 1180, margin: '0 auto', padding: '0 36px 80px' }}>
        <h2 style={{ fontWeight: 800, fontSize: 36, textAlign: 'center', marginBottom: 10, color: '#e2e8f8' }}>Platform capabilities</h2>
        <p style={{ color: '#4a5580', textAlign: 'center', marginBottom: 44, fontSize: 15 }}>Enterprise-style interview infrastructure — built for reliability at scale.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 18 }}>
          {FEATURES.map((f, i) => (
            <div key={i} className="glass-card glass-card-hover" style={{ padding: '28px', cursor: 'default' }}>
              <div style={{ fontSize: 28, marginBottom: 14 }}>{f.icon}</div>
              <h3 style={{ fontWeight: 700, fontSize: 17, marginBottom: 8, color: '#e2e8f8' }}>{f.title}</h3>
              <p style={{ fontSize: 13, color: '#5a6485', lineHeight: 1.7, margin: 0 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

/* ─────────────────────────────────────────────
   USER DASHBOARD
───────────────────────────────────────────── */
function UserDashboard({ setPage, onStartInterview, onResumeSession, micStatus, camStatus, checkDevices, reportStream, reportStreamEnded, reportPermissionDenied, infra, user, onLogout }) {
  const [cameraActive, setCameraActive] = useState(false)
  const [starting, setStarting] = useState(false)
  const [selectedProfileId, setSelectedProfileId] = useState(INTERVIEW_PROFILES[0].id)
  const selectedProfile = getProfileById(selectedProfileId)

  const handleStreamReady = useCallback((stream) => { reportStream(stream); setCameraActive(true) }, [reportStream])
  const handleStreamEnd = useCallback((hadAudio) => { reportStreamEnded(hadAudio ?? true); setCameraActive(false) }, [reportStreamEnded])

  const devicesReady = cameraActive && micStatus === 'connected' && camStatus === 'connected'

  const handleStart = async () => {
    setStarting(true)
    try { await onStartInterview({ hardwareCheck: { camera: camStatus === 'connected' || cameraActive, microphone: micStatus === 'connected' }, interviewProfile: selectedProfile }) }
    finally { setStarting(false) }
  }
  const handleResume = async () => {
    setStarting(true)
    try { const r = await infra.resumeSession(); if (r) onResumeSession?.(r) }
    finally { setStarting(false) }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#04070f', position: 'relative' }}>
      <BackgroundDecor />
      <nav className="ix-nav">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="ix-logo-mark">iX</div>
          <div><div className="ix-logo-name">Intervue<span>X</span></div></div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setPage('home')} className="btn-secondary" style={{ fontSize: 13 }}>← Home</button>
          <button onClick={onLogout} className="btn-secondary" style={{ fontSize: 13 }}>Sign out</button>
        </div>
      </nav>

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1180, margin: '0 auto', padding: '36px 36px' }}>
        {infra.hasResumableSession && (() => {
          const summary = infra.getRecoverySummary?.()
          return (
            <div style={{ background: 'rgba(99,220,169,.07)', border: '1px solid rgba(99,220,169,.2)', borderRadius: 14, padding: '16px 22px', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
              <div>
                <div style={{ fontWeight: 700, color: '#63dca9' }}>Continue your interview</div>
                <div style={{ fontSize: 13, color: '#5a6485', marginTop: 3 }}>
                  {summary
                    ? `${summary.answered}/${summary.total} questions answered · ${summary.uploadedChunks} chunks uploaded · Q${summary.questionIndex + 1} next`
                    : 'Your progress was saved locally and on the server.'}
                </div>
              </div>
              <button onClick={handleResume} disabled={starting} className="btn-primary" style={{ fontSize: 13 }}>Resume →</button>
            </div>
          )
        })()}

        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, color: '#63dca9', letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>Candidate Portal</div>
          <h1 style={{ fontWeight: 800, fontSize: 40, letterSpacing: '-.03em', color: '#e2e8f8' }}>
            Interview <span className="gradient-text">Dashboard</span>
          </h1>
          {user && <p style={{ fontSize: 13, color: '#4a5580', marginTop: 5 }}>Signed in as {user.email}</p>}
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 13, marginBottom: 28 }}>
          {[
            { label: 'Status', value: devicesReady ? 'Ready to Start' : 'Setup Required', color: devicesReady ? '#63dca9' : '#f5c842' },
            { label: 'Hardware', value: micStatus === 'connected' && camStatus === 'connected' ? 'All Connected' : 'Check Devices', color: micStatus === 'connected' && camStatus === 'connected' ? '#63dca9' : '#ff5a6e' },
            { label: 'Duration', value: formatDuration(selectedProfile), color: '#e2e8f8' },
            { label: 'Questions', value: '6 total', color: '#e2e8f8' },
          ].map((stat, i) => (
            <div key={i} className="ix-stat">
              <div className="ix-stat-label">{stat.label}</div>
              <div style={{ fontWeight: 700, fontSize: 17, color: stat.color }}>{stat.value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22 }}>
          {/* Left */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="glass-card" style={{ padding: '22px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <h2 style={{ fontWeight: 700, fontSize: 18, color: '#e2e8f8', margin: 0 }}>Camera Preview</h2>
                <button onClick={checkDevices} className="btn-secondary" style={{ fontSize: 12, padding: '6px 14px' }}>↻ Re-check</button>
              </div>
              <CameraPreviewWithStream audio showControls onStreamReady={handleStreamReady} onStreamEnd={handleStreamEnd} onPermissionDenied={() => reportPermissionDenied(true)} />
              {!devicesReady && (
                <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, background: 'rgba(245,200,66,.07)', border: '1px solid rgba(245,200,66,.18)', fontSize: 13, color: '#f5c842' }}>
                  Enable camera & microphone above before starting.
                </div>
              )}
              <button onClick={handleStart} disabled={starting || !devicesReady} className="btn-primary" style={{ marginTop: 13, width: '100%', padding: '13px', fontSize: 14 }}>
                {starting ? '⟳ Starting...' : `Start Interview with ${ASSISTANT_NAME} →`}
              </button>
            </div>

            <div className="glass-card" style={{ padding: '22px' }}>
              <h3 style={{ fontWeight: 700, fontSize: 16, color: '#e2e8f8', marginBottom: 5, marginTop: 0 }}>Interview Track</h3>
              <p style={{ fontSize: 13, color: '#5a6485', marginBottom: 14, marginTop: 0 }}>Questions tailored to your chosen role.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {INTERVIEW_PROFILES.map(p => (
                  <button key={p.id} onClick={() => setSelectedProfileId(p.id)} style={{
                    textAlign: 'left', padding: '11px 14px', borderRadius: 10, border: '1px solid',
                    borderColor: selectedProfileId === p.id ? 'rgba(99,220,169,.4)' : 'rgba(255,255,255,.07)',
                    background: selectedProfileId === p.id ? 'rgba(99,220,169,.08)' : 'transparent',
                    cursor: 'pointer', transition: 'all .18s', color: '#e2e8f8',
                    fontFamily: 'Outfit, sans-serif',
                  }}>
                    <div style={{ fontWeight: 500, fontSize: 14 }}>{p.title}</div>
                    <div style={{ fontSize: 12, color: '#4a5580', marginTop: 2 }}>{formatDuration(p)} · 6 questions</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right */}
          <div className="glass-card" style={{ padding: '24px', height: 'fit-content' }}>
            <h2 style={{ fontWeight: 800, fontSize: 20, color: '#e2e8f8', marginTop: 0, marginBottom: 20 }}>Interview Guidelines</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
              {[
                `${ASSISTANT_NAME} will ask questions aloud — listen carefully.`,
                'Keep your camera on during the entire interview.',
                'Speak clearly — your answers are transcribed live.',
                'Click Submit Answer when you finish each response.',
                'Avoid switching browser tabs — proctoring is active.',
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ width: 26, height: 26, borderRadius: 8, background: 'rgba(99,220,169,.1)', border: '1px solid rgba(99,220,169,.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#63dca9', flexShrink: 0 }}>{i + 1}</div>
                  <p style={{ fontSize: 14, color: '#c8d0e8', lineHeight: 1.65, margin: 0, paddingTop: 2 }}>{item}</p>
                </div>
              ))}
            </div>
            <div style={{ height: 1, background: 'rgba(255,255,255,.06)', margin: '20px 0' }} />
            <div style={{ fontSize: 11, color: '#3a4260', letterSpacing: '.07em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 12 }}>Device Status</div>
            {[['Microphone', micStatus],['Camera', camStatus]].map(([l, s]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 14, color: '#5a6485' }}>{l}</span>
                <StatusDot status={s} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────
   INTERVIEW SESSION
───────────────────────────────────────────── */
function InterviewSession({ setPage, onComplete, reportStream, infra, interviewProfile }) {
  const profile = interviewProfile ?? INTERVIEW_PROFILES[0]
  const questions = getQuestionTexts(profile)
  const targetSeconds = (profile.durationMinutes ?? 25) * 60
  const [questionIndex, setQuestionIndex] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [answers, setAnswers] = useState([])
  const [restoredNotice, setRestoredNotice] = useState(false)
  const tabWarnings = infra?.proctoring?.tabWarnings ?? 0
  const faceAbsenceWarnings = infra?.proctoring?.faceAbsenceWarnings ?? 0
  const liveAlerts = infra?.proctoring?.liveAlerts ?? []

  const infraRef = useRef(infra); infraRef.current = infra
  const [readyToFinish, setReadyToFinish] = useState(false)
  const [isAdvancing, setIsAdvancing] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)
  const [activeStream, setActiveStream] = useState(null)
  const streamRef = useRef(null)
  const questionIndexRef = useRef(0)
  const answersRef = useRef([])
  const submittingRef = useRef(false)
  const finishingRef = useRef(false)
  const [isFinishing, setIsFinishing] = useState(false)
  const askedQuestionRef = useRef(-1)
  const restoredFromSessionRef = useRef(false)
  const checkpointTimerRef = useRef(null)
  const voice = useVoiceAssistant()
  questionIndexRef.current = questionIndex
  answersRef.current = answers

  const recordingStartedRef = useRef(false)
  const faceMonitorStartedRef = useRef(false)
  const elapsedAnchorRef = useRef({ startedAt: Date.now(), base: 0 })

  const saveCheckpoint = useCallback(
    (overrides = {}) => {
      const snap = infraRef.current?.getProctoringSnapshot?.() ?? { tabWarnings: 0, faceAbsenceWarnings: 0 }
      const chunkStatus = infraRef.current?.chunkStatus ?? {}
      return infraRef.current?.persistCheckpoint?.({
        questionIndex: overrides.questionIndex ?? questionIndexRef.current,
        answers: overrides.answers ?? answers,
        elapsed: overrides.elapsed ?? elapsed,
        readyToFinish: overrides.readyToFinish ?? readyToFinish,
        liveTranscript:
          overrides.liveTranscript ?? voice.getFullTranscript(),
        currentQuestion: overrides.currentQuestion ?? questions[questionIndexRef.current],
        interviewProfileId: profile.id,
        questions: infraRef.current?.session?.session_data?.questions ?? questions,
        uploadedChunkCount:
          chunkStatus.uploaded ??
          infraRef.current?.session?.session_data?.uploadedChunkCount ??
          0,
        tabWarnings: snap.tabWarnings,
        faceAbsenceWarnings: snap.faceAbsenceWarnings,
        ...overrides,
      })
    },
    [answers, elapsed, readyToFinish, voice, questions, profile.id]
  )

  const handleStreamReady = useCallback((stream) => {
    streamRef.current = stream; setActiveStream(stream); reportStream(stream); setCameraReady(true)
    if (!recordingStartedRef.current) {
      if (infraRef.current?.startRecording(stream) !== false) recordingStartedRef.current = true
    }
  }, [reportStream])

  const handleVideoReady = useCallback((videoEl) => {
    if (faceMonitorStartedRef.current) return
    faceMonitorStartedRef.current = true; infraRef.current?.startFaceMonitoring(videoEl)
  }, [])

  useEffect(() => {
    elapsedAnchorRef.current = { startedAt: Date.now(), base: elapsed }
  }, [infra.session?.id])

  useEffect(() => {
    const timer = setInterval(() => {
      const { startedAt, base } = elapsedAnchorRef.current
      setElapsed(base + Math.floor((Date.now() - startedAt) / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    let hiddenTimer = null
    const onHidden = () => {
      if (!document.hidden) { if (hiddenTimer) clearTimeout(hiddenTimer); hiddenTimer = null; return }
      if (hiddenTimer) return
      hiddenTimer = setTimeout(() => { if (document.hidden) infraRef.current?.reportTabSwitch(); hiddenTimer = null }, 800)
    }
    document.addEventListener('visibilitychange', onHidden)
    return () => { document.removeEventListener('visibilitychange', onHidden); if (hiddenTimer) clearTimeout(hiddenTimer) }
  }, [])

  useEffect(() => {
    if (!infra.session?.id) return
    saveActiveRoute({ page: 'interview', sessionId: infra.session.id })
    return () => {
      if (infra.session?.session_data?.status !== 'completed') {
        saveCheckpoint()
      }
    }
  }, [infra.session?.id, saveCheckpoint])

  useEffect(() => {
    if (!infra.session?.session_data || restoredFromSessionRef.current) return
    restoredFromSessionRef.current = true

    const sd = infra.session.session_data
    const restoredAnswers = sd.answers ?? []
    const restoredIndex = resolveQuestionIndex(sd)
    const restoredElapsed = sd.elapsed ?? 0
    const restoredReady = !!sd.readyToFinish

    setAnswers(restoredAnswers)
    setQuestionIndex(restoredIndex)
    setElapsed(restoredElapsed)
    elapsedAnchorRef.current = { startedAt: Date.now(), base: restoredElapsed }
    setReadyToFinish(restoredReady)
    askedQuestionRef.current = -1

    if (sd.liveTranscript) {
      voice.setTranscriptFromRestore(sd.liveTranscript)
    }

    if (restoredAnswers.length > 0 || restoredIndex > 0) {
      setRestoredNotice(true)
    }
  }, [infra.session?.id, infra.session?.session_data])

  useEffect(() => {
    if (checkpointTimerRef.current) clearTimeout(checkpointTimerRef.current)
    if (!infra.session?.id) return
    checkpointTimerRef.current = setTimeout(() => {
      saveCheckpoint()
    }, 2500)
    return () => {
      if (checkpointTimerRef.current) clearTimeout(checkpointTimerRef.current)
    }
  }, [voice.transcript, voice.interimTranscript, questionIndex, answers, elapsed, readyToFinish, saveCheckpoint, infra.session?.id])

  useEffect(() => {
    const flushCheckpoint = () => {
      saveCheckpoint()
    }
    window.addEventListener('beforeunload', flushCheckpoint)
    window.addEventListener('pagehide', flushCheckpoint)
    return () => {
      window.removeEventListener('beforeunload', flushCheckpoint)
      window.removeEventListener('pagehide', flushCheckpoint)
    }
  }, [saveCheckpoint])

  useEffect(() => {
    if (!cameraReady || readyToFinish) return
    if (questionIndex < 0 || questionIndex >= questions.length) return
    if (askedQuestionRef.current === questionIndex) return
    askedQuestionRef.current = questionIndex
    let cancelled = false
    async function askCurrentQuestion() {
      try {
        voice.resetTranscript()
        await voice.speak(buildQuestionSpeech(questionIndex, questions, profile))
        if (!cancelled) await voice.listenAfterSpeech()
      } catch {
        if (!cancelled) await voice.listenAfterSpeech()
      }
    }
    askCurrentQuestion()
    return () => {
      cancelled = true
      try { voice.stopListening(); voice.cancelSpeech() } catch {}
    }
  }, [cameraReady, questionIndex, readyToFinish])

  useEffect(() => () => voice.cleanup(), [])

  const formatTime = (secs) => `${Math.floor(secs / 60).toString().padStart(2, '0')}:${(secs % 60).toString().padStart(2, '0')}`
  const isLastQuestion = questionIndex === questions.length - 1
  const pct = ((questionIndex + (readyToFinish ? 1 : 0)) / questions.length) * 100

  const buildFinishPayload = () => {
    voice.stopListening()
    const partial = voice.getFullTranscript()
    const currentIdx = questionIndexRef.current
    let finalAnswers = [...answersRef.current]
    const alreadySaved = finalAnswers.some((a) => a.question === questions[currentIdx])
    if (partial && !readyToFinish && !alreadySaved && questions[currentIdx]) {
      finalAnswers = [...finalAnswers, { question: questions[currentIdx], answer: partial }]
      answersRef.current = finalAnswers
    }
    const p = infraRef.current?.getProctoringSnapshot?.() ?? {
      tabWarnings: 0,
      faceAbsenceWarnings: 0,
      proctoringLog: [],
      flags: [],
    }
    return {
      elapsed,
      tabWarnings: p.tabWarnings,
      faceAbsenceWarnings: p.faceAbsenceWarnings,
      proctoringLog: p.proctoringLog,
      questionsAnswered: finalAnswers.length,
      answers: finalAnswers,
      flags: p.flags,
      sessionId: infraRef.current?.session?.id,
      interviewProfile: profile,
      questions,
      endedEarly: finalAnswers.length < questions.length,
    }
  }

  const finishInterview = async () => {
    if (finishingRef.current) return
    finishingRef.current = true
    setIsFinishing(true)

    const payload = buildFinishPayload()

    try {
      await onComplete(payload, { navigateImmediately: true })
    } finally {
      voice.cleanup()
      infraRef.current?.stopFaceMonitoring()
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
      clearActiveRoute()
      finishingRef.current = false
      setIsFinishing(false)
    }
  }

  const handleRepeat = async () => {
    askedQuestionRef.current = -1; voice.stopListening()
    await voice.speak(`Let me repeat that. ${questions[questionIndex]}`)
    await voice.listenAfterSpeech()
    askedQuestionRef.current = questionIndex
  }

  const handleSubmitAnswer = async () => {
    if (submittingRef.current || isAdvancing || finishingRef.current || voice.state === 'speaking') {
      return
    }
    submittingRef.current = true
    setIsAdvancing(true)
    voice.stopListening()
    const currentIndex = questionIndexRef.current
    const answer = voice.getFullTranscript() || '(No verbal response recorded)'
    const newAnswers = [
      ...answersRef.current,
      { question: questions[currentIndex], answer },
    ]
    setAnswers(newAnswers)
    answersRef.current = newAnswers
    const nextIndex = currentIndex + 1
    const snap = infraRef.current?.getProctoringSnapshot?.() ?? { tabWarnings: 0, faceAbsenceWarnings: 0 }
    voice.resetTranscript()
    await infraRef.current?.persistCheckpoint?.({
      questionIndex: nextIndex,
      answers: newAnswers,
      liveTranscript: '',
      currentQuestion: questions[nextIndex] ?? null,
      readyToFinish: currentIndex >= questions.length - 1,
      tabWarnings: snap.tabWarnings,
      faceAbsenceWarnings: snap.faceAbsenceWarnings,
      elapsed,
      interviewProfileId: profile.id,
      questions: infraRef.current?.session?.session_data?.questions ?? questions,
    })
    const isLast = currentIndex >= questions.length - 1
    if (isLast) {
      setReadyToFinish(true); askedQuestionRef.current = -1
      await voice.speak(`Thank you for your thoughtful answers. You've completed all ${questions.length} questions. Click Finish Interview when you're ready.`)
    } else { askedQuestionRef.current = -1; setQuestionIndex(currentIndex + 1) }
    submittingRef.current = false; setIsAdvancing(false)
  }

  const handleExit = () => {
    if (window.confirm('Leave the interview? Your progress is saved — you can resume later from the dashboard.')) {
      saveCheckpoint()
      clearActiveRoute()
      voice.cleanup()
      if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
      setPage('user')
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#04070f', position: 'relative', overflow: 'hidden' }}>
      <BackgroundDecor />
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1100, margin: '0 auto', padding: '24px 22px' }}>
        {/* Top bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 11, color: '#63dca9', letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 3 }}>Live Interview · {ASSISTANT_NAME}</div>
            <h1 style={{ fontWeight: 800, fontSize: 22, color: '#e2e8f8', margin: 0 }}>
              {cameraReady ? `${profile.title} · Q${questionIndex + 1}/${questions.length}` : 'Preparing interview room...'}
            </h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={handleExit} className="btn-secondary" style={{ fontSize: 13, padding: '8px 16px' }}>← Exit</button>
            <div className="ix-rec"><div className="ix-rec-dot" />REC {formatTime(elapsed)}/{formatTime(targetSeconds)}</div>
            {elapsed > targetSeconds && <span className="ix-badge ix-badge-amber">Over time</span>}
            {(tabWarnings > 0 || faceAbsenceWarnings > 0) && (
              <span className="ix-badge ix-badge-amber">⚑ {tabWarnings}t · {faceAbsenceWarnings}f</span>
            )}
          </div>
        </div>

        <InterviewStatusBar apiOnline={infra.apiOnline} wsConnected={infra.wsConnected} networkOnline={infra.networkOnline} chunkStatus={infra.chunkStatus} />

        {infra.systemMessage && (
          <FailureBanner
            message={infra.systemMessage.text}
            severity={infra.systemMessage.severity}
            onDismiss={infra.clearSystemMessage}
            onRetry={
              infra.chunkStatus?.failed > 0 || infra.chunkStatus?.pending > 0
                ? infra.retryChunkUploads
                : undefined
            }
            retryLabel="Retry uploads"
          />
        )}

        {restoredNotice && (
          <FailureBanner
            message={`Session restored — continuing from question ${questionIndex + 1} of ${questions.length} (${answers.length} answer${answers.length === 1 ? '' : 's'} saved). Re-enable camera and microphone to continue recording.`}
            severity="info"
            onDismiss={() => setRestoredNotice(false)}
          />
        )}

        {!cameraReady && (
          <div style={{ background: 'rgba(99,220,169,.07)', border: '1px solid rgba(99,220,169,.2)', borderRadius: 14, padding: '16px 22px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
            <div className="ix-spin" style={{ width: 28, height: 28, border: '2px solid #63dca9', borderTopColor: 'transparent', borderRadius: '50%', flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 600, color: '#e2e8f8', marginBottom: 2 }}>Preparing your interview room...</div>
              <div style={{ fontSize: 13, color: '#5a6485' }}>Allow camera access when prompted. {ASSISTANT_NAME} will begin shortly.</div>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 3fr', gap: 18 }}>
          {/* Left */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            <div className="glass-card" style={{ padding: '12px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', left: 0, right: 0, height: 2, background: 'linear-gradient(90deg,transparent,#63dca9,transparent)', animation: 'ix-scan 2.5s linear infinite', top: 0, pointerEvents: 'none' }} />
              <CameraPreviewWithStream autoStart audio showRec allowStop={false} onStreamReady={handleStreamReady} onVideoReady={handleVideoReady} />
              <div style={{ marginTop: 9, textAlign: 'center', fontSize: 10, color: '#3a4260', letterSpacing: '.07em' }}>PROCTORING ACTIVE — STAY IN TAB</div>
            </div>
            <ProctoringAlerts tabWarnings={tabWarnings} faceAbsenceWarnings={faceAbsenceWarnings} liveAlerts={liveAlerts} wsConnected={infra?.wsConnected ?? false} />
            <ChunkRecordingPanel compact sessionId={infra.session?.id} stream={activeStream}
              isRecording={infra.chunkStatus?.isRecording} recordingSeconds={infra.chunkStatus?.recordingSeconds ?? 0}
              uploaded={infra.chunkStatus?.uploaded ?? 0} failed={infra.chunkStatus?.failed ?? 0}
              pending={infra.chunkStatus?.pending ?? 0} retries={infra.chunkStatus?.retries ?? 0}
              uploadProgress={infra.chunkStatus?.uploadProgress ?? 0} lastError={infra.chunkStatus?.lastError}
              syncStatus={infra.chunkStatus?.syncStatus} isOnline={infra.chunkStatus?.isOnline}
              onStart={() => { const s = activeStream ?? streamRef.current; if (s) infra.startChunkRecording(s) }}
              onStop={() => infra.stopChunkRecording()}
              onRetryUploads={infra.retryChunkUploads}
            />
          </div>

          {/* Right */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <VoiceAssistantPanel
              state={voice.state}
              transcript={voice.transcript}
              interimTranscript={voice.interimTranscript}
              supported={voice.supported}
              recognitionError={voice.recognitionError}
              onRepeat={handleRepeat}
              onRestartMic={() => voice.listenAfterSpeech()}
            />

            {/* Question card */}
            <div className="glass-card" style={{ padding: '22px', position: 'relative', overflow: 'hidden' }}>
              <div className="ix-q-watermark">Q{questionIndex + 1}</div>
              <div style={{ fontSize: 10, color: '#63dca9', letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>Current Question</div>
              <div style={{ fontSize: 10, color: '#3a4260', letterSpacing: '.06em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 10 }}>
                {profile.questions[questionIndex]?.type === 'behavioral' ? 'Behavioral' : 'Role-Specific'}
              </div>
              <p style={{ fontSize: 17, lineHeight: 1.65, color: '#e2e8f8', marginBottom: 16, margin: '0 0 16px' }}>{questions[questionIndex]}</p>
              <div className="ix-progress" style={{ marginBottom: 7 }}>
                <div className="ix-progress-fill ix-progress-teal" style={{ width: `${pct}%` }} />
              </div>
              <div style={{ fontSize: 12, color: '#4a5580' }}>{answers.length} answered · {questions.length} total · ~{profile.durationMinutes}min target</div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 12 }}>
              {readyToFinish ? (
                <button onClick={finishInterview} disabled={isFinishing} className="btn-primary" style={{ flex: 1, padding: '14px', fontSize: 15 }}>
                  {isFinishing ? 'Submitting…' : 'Finish Interview →'}
                </button>
              ) : (
                <button onClick={handleSubmitAnswer} disabled={!cameraReady || voice.state === 'speaking' || isAdvancing} className="btn-primary" style={{ flex: 1, padding: '14px', fontSize: 15 }}>
                  {isLastQuestion ? 'Submit Final Answer' : 'Submit Answer →'}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (!window.confirm('End the interview early? Your answers so far will be submitted.')) return
                  finishInterview()
                }}
                disabled={isFinishing || isAdvancing}
                className="btn-secondary"
                style={{ padding: '14px 22px', fontSize: 14, minWidth: 108 }}
              >
                {isFinishing ? 'Exiting…' : 'End Early'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Error Boundary ─── */
class InterviewErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false } }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch(error, info) { console.error('Interview error:', error, info?.componentStack) }
  handleRetry = () => { this.setState({ hasError: false }); this.props.onRetry?.() }
  render() {
    if (this.state.hasError) return (
      <div style={{ minHeight: '100vh', background: '#04070f', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div className="glass-card" style={{ maxWidth: 420, width: '100%', textAlign: 'center', padding: '44px' }}>
          <div style={{ fontSize: 44, marginBottom: 14 }}>⚡</div>
          <h1 style={{ fontWeight: 800, fontSize: 24, color: '#e2e8f8', marginBottom: 10 }}>Interview Interrupted</h1>
          <p style={{ color: '#5a6485', marginBottom: 26, lineHeight: 1.7 }}>Something went wrong. You can retry or return to the dashboard.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button onClick={this.handleRetry} className="btn-primary" style={{ width: '100%', padding: '13px', fontSize: 14 }}>↺ Retry Interview</button>
            <button onClick={() => this.props.onBack()} className="btn-secondary" style={{ width: '100%', padding: '13px', fontSize: 14 }}>← Back to Dashboard</button>
          </div>
        </div>
      </div>
    )
    return this.props.children
  }
}

/* ─── Complete Page ─── */
function InterviewCompletePage({ interviewTitle, durationFormatted, setPage, pipeline, rtConnected }) {
  return (
    <div style={{ minHeight: '100vh', background: '#04070f', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
      <BackgroundDecor />
      <div className="glass-card animate-slide-up" style={{ position: 'relative', zIndex: 1, maxWidth: 460, width: '100%', margin: 22, padding: '48px', textAlign: 'center', borderColor: 'rgba(99,220,169,.25)' }}>
        <div style={{ width: 66, height: 66, borderRadius: 20, background: 'rgba(99,220,169,.1)', border: '1px solid rgba(99,220,169,.28)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, margin: '0 auto 20px', boxShadow: '0 0 28px rgba(99,220,169,.2)', animation: 'ix-tick .5s cubic-bezier(.22,1,.36,1)' }}>✓</div>
        <h1 className="gradient-text" style={{ fontWeight: 800, fontSize: 30, marginBottom: 12 }}>Interview Submitted</h1>
        <p style={{ color: '#5a6485', lineHeight: 1.75, marginBottom: 8, fontSize: 15 }}>
          Thank you for completing the <strong style={{ color: '#c8d0e8' }}>{interviewTitle}</strong> interview{durationFormatted ? ` (${durationFormatted})` : ''}.
        </p>
        {rtConnected && (
          <p style={{ fontSize: 11, color: '#63dca9', marginBottom: 12 }}>Live updates connected</p>
        )}
        <PipelineStatusBanner pipeline={pipeline} />
        <p style={{ fontSize: 13, color: '#2a3348', lineHeight: 1.7, marginBottom: 32 }}>
          Your responses are recorded. Recruiters will review AI-generated scores and feedback on their dashboard.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={() => setPage('user')} className="btn-primary" style={{ width: '100%', padding: '13px', fontSize: 14 }}>Back to Dashboard</button>
          <button onClick={() => setPage('home')} className="btn-secondary" style={{ width: '100%', padding: '13px', fontSize: 14 }}>Home</button>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────
   RECRUITER DASHBOARD
───────────────────────────────────────────── */
function RecruiterDashboard({ setPage, candidates, onReview, onRemove, onFilter, user, onLogout, loadingCandidates, liveConnected, loadError, onRetryLoad }) {
  const [filter, setFilter] = useState('all')

  const filtered = candidates.filter(c => {
    if (filter === 'all') return true
    if (filter === 'pending') return c.status === 'Review Pending' && !isCandidateFlagged(c)
    if (filter === 'flagged') return isCandidateFlagged(c)
    if (filter === 'approved') return c.status === 'Approved'
    if (filter === 'rejected') return c.status === 'Rejected'
    return true
  })

  const stats = [
    { label: 'Total Interviews', value: candidates.length, color: '#e2e8f8' },
    { label: 'Flagged', value: candidates.filter(c => isCandidateFlagged(c)).length, color: '#f5c842' },
    { label: 'Approved', value: candidates.filter(c => c.status === 'Approved').length, color: '#63dca9' },
    { label: 'Pending Review', value: candidates.filter(c => c.status === 'Review Pending' && !isCandidateFlagged(c)).length, color: '#a090ff' },
  ]

  const chips = [
    { key: 'all', label: 'All Candidates' },
    { key: 'pending', label: 'Pending Review' },
    { key: 'flagged', label: '⚑ Flagged' },
    { key: 'approved', label: '✓ Approved' },
    { key: 'rejected', label: '✕ Rejected' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#04070f', position: 'relative' }}>
      <BackgroundDecor />
      <nav className="ix-nav">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="ix-logo-mark">iX</div>
          <div><div className="ix-logo-name">Intervue<span>X</span></div></div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setPage('home')} className="btn-secondary" style={{ fontSize: 13 }}>← Home</button>
          <button onClick={onLogout} className="btn-secondary" style={{ fontSize: 13 }}>Sign out</button>
        </div>
      </nav>

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1180, margin: '0 auto', padding: '36px 36px' }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, color: '#63dca9', letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>Recruiter Portal</div>
          <h1 style={{ fontWeight: 800, fontSize: 40, letterSpacing: '-.03em', color: '#e2e8f8' }}>
            Interview <span className="gradient-text">Analytics</span>
          </h1>
          {user && <p style={{ fontSize: 13, color: '#4a5580', marginTop: 5 }}>Signed in as {user.email}</p>}
          {liveConnected && (
            <p style={{ fontSize: 12, color: '#63dca9', marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#63dca9', boxShadow: '0 0 8px #63dca9' }} />
              Live updates — new interviews appear automatically
            </p>
          )}
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 13, marginBottom: 28 }}>
          {stats.map(s => (
            <div key={s.label} className="ix-stat">
              <div className="ix-stat-label">{s.label}</div>
              <div className="ix-stat-value" style={{ color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Filter chips */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 22, flexWrap: 'wrap' }}>
          {chips.map(c => (
            <button key={c.key} onClick={() => { setFilter(c.key); onFilter(c.label) }} className={`ix-chip${filter === c.key ? ' active' : ''}`}>
              {c.label}
            </button>
          ))}
        </div>

        {/* Candidate grid */}
        {loadingCandidates ? (
          <div className="glass-card" style={{ padding: '44px', textAlign: 'center', color: '#4a5580' }}>
            <div className="ix-spin" style={{ width: 32, height: 32, border: '2px solid #63dca9', borderTopColor: 'transparent', borderRadius: '50%', margin: '0 auto 13px' }} />
            Loading interviews...
          </div>
        ) : loadError ? (
          <div className="glass-card" style={{ padding: '32px', textAlign: 'center' }}>
            <FailureBanner
              message={loadError}
              severity="error"
              onRetry={onRetryLoad}
              retryLabel="Reload interviews"
            />
          </div>
        ) : filtered.length === 0 ? (
          <div className="glass-card" style={{ padding: '44px', textAlign: 'center', color: '#4a5580' }}>
            {candidates.length === 0 ? 'No completed interviews yet. Candidates appear here after completing a signed-in interview.' : 'No candidates match this filter.'}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
            {filtered.map(candidate => {
              const ds = getCandidateDisplayStatus(candidate)
              const cst = getCandidateStatusStyle(ds)
              return (
                <div key={candidate.id} className={`glass-card glass-card-hover ${cst.card}`} style={{ padding: '22px', position: 'relative' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                    <CandidateStatusBadge status={ds} />
                    <button onClick={() => onRemove(candidate)} style={{ background: 'none', border: '1px solid rgba(255,255,255,.07)', borderRadius: 7, padding: '3px 10px', cursor: 'pointer', color: '#4a5580', fontSize: 11, fontFamily: 'Outfit,sans-serif', transition: 'all .18s' }}>Remove</button>
                  </div>
                  <div style={{ display: 'flex', gap: 13, marginBottom: 16 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 13, background: cst.avatar, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18, color: '#04070f', flexShrink: 0 }}>
                      {candidate.name.charAt(0)}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: '#e2e8f8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{candidate.name}</div>
                      <div style={{ fontSize: 12, color: '#4a5580', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{candidate.role}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 16 }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                        <span style={{ color: '#4a5580' }}>Communication</span>
                        <span style={{ color: '#63dca9', fontWeight: 600 }}>{candidate.communication}/10</span>
                      </div>
                      <ProgressBar value={candidate.communication} color="teal" />
                    </div>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                        <span style={{ color: '#4a5580' }}>Confidence</span>
                        <span style={{ color: '#f5c842', fontWeight: 600 }}>{candidate.confidenceScore ?? '—'}{candidate.confidenceScore != null ? '/10' : ''}</span>
                      </div>
                      {candidate.confidenceScore != null && (
                        <ProgressBar value={candidate.confidenceScore} color="amber" />
                      )}
                    </div>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                        <span style={{ color: '#4a5580' }}>Keyword match</span>
                        <span style={{ color: '#a090ff', fontWeight: 600 }}>{candidate.keywordMatchScore ?? '—'}{candidate.keywordMatchScore != null ? '%' : ''}</span>
                      </div>
                      {candidate.keywordMatchScore != null && (
                        <ProgressBar value={candidate.keywordMatchScore} max={100} color="violet" />
                      )}
                    </div>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                        <span style={{ color: '#4a5580' }}>Technical</span>
                        <span style={{ color: '#a090ff', fontWeight: 600 }}>{candidate.technical}/10</span>
                      </div>
                      <ProgressBar value={candidate.technical} color="violet" />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ color: '#4a5580' }}>Integrity</span>
                      <span style={{ color: (candidate.integrityScore ?? 10) < 6 ? '#ff5a6e' : '#63dca9', fontWeight: 600 }}>{candidate.integrityScore ?? '—'}/10</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#3a4260' }}>
                      <span>Tab / Face flags</span>
                      <span>{candidate.tabWarnings ?? 0} / {candidate.faceAbsenceWarnings ?? 0}</span>
                    </div>
                    {candidate.recommendation && (
                      <div style={{ fontSize: 11, color: '#5a6485', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        AI: {candidate.recommendation}
                      </div>
                    )}
                  </div>
                  <button onClick={() => onReview(candidate)} className="btn-primary" style={{ width: '100%', padding: '11px', fontSize: 13 }}>Review Interview →</button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────
   ROOT APP  (logic unchanged from original)
───────────────────────────────────────────── */
export default function AIInterviewFrontend() {
  const auth = useAuth()
  const { user, authReady } = auth

  // Always show login when there is no user (never block on authReady alone)
  if (!user) {
    if (!authReady) {
      return (
        <>
          <InjectStyles />
          <div
            style={{
              minHeight: '100vh',
              background: '#04070f',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <div
              className="ix-spin"
              style={{
                width: 44,
                height: 44,
                border: '2px solid #63dca9',
                borderTopColor: 'transparent',
                borderRadius: '50%',
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="ix-logo-mark">iX</div>
              <div className="ix-logo-name">
                Intervue<span>X</span>
              </div>
            </div>
          </div>
        </>
      )
    }

    return (
      <>
        <InjectStyles />
        <AuthPage />
      </>
    )
  }

  if (!authReady) {
    return (
      <>
        <InjectStyles />
        <div
          style={{
            minHeight: '100vh',
            background: '#04070f',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <div
            className="ix-spin"
            style={{
              width: 44,
              height: 44,
              border: '2px solid #63dca9',
              borderTopColor: 'transparent',
              borderRadius: '50%',
            }}
          />
        </div>
      </>
    )
  }

  return <AuthenticatedApp auth={auth} />
}

function AuthenticatedApp({ auth }) {
  const { user, logout, isRecruiter, isCandidate } = auth
  const [page, setPage] = useState('home')
  const loginBootstrappedRef = useRef(false)
  const recruiterLandingDoneRef = useRef(false)
  const [showDemo, setShowDemo] = useState(false)
  const [reviewCandidate, setReviewCandidate] = useState(null)
  const reviewCandidateRef = useRef(null)
  reviewCandidateRef.current = reviewCandidate
  const [candidates, setCandidates] = useState([])
  const [loadingCandidates, setLoadingCandidates] = useState(false)
  const [recruiterLoadError, setRecruiterLoadError] = useState(null)
  const [toast, setToast] = useState(null)
  const [interviewProfile, setInterviewProfile] = useState(INTERVIEW_PROFILES[0])
  const [completeSummary, setCompleteSummary] = useState(null)
  const [interviewKey, setInterviewKey] = useState(0)
  const { micStatus, camStatus, checkDevices, reportStream, reportStreamEnded, reportPermissionDenied } = useMediaDevices()
  const infra = useInterviewInfrastructure()

  useEffect(() => { checkDevices() }, [checkDevices])

  useEffect(() => {
    if (isRecruiter && user && !recruiterLandingDoneRef.current) {
      recruiterLandingDoneRef.current = true
      setPage('recruiter')
    }
    if (!user) recruiterLandingDoneRef.current = false
  }, [isRecruiter, user])

  useEffect(() => {
    if (!user) {
      loginBootstrappedRef.current = false
      return
    }
    if (loginBootstrappedRef.current) return
    loginBootstrappedRef.current = true

    const nav = performance.getEntriesByType?.('navigation')?.[0]
    const isReload = nav?.type === 'reload'

    if (!isCandidate) return

    if (!isReload) {
      clearActiveRoute()
      return
    }

    const active = loadActiveRoute()
    if (active?.page !== 'interview') return

    infra
      .resumeSession()
      .then((s) => {
        if (s && s.session_data?.status !== 'completed') {
          const pid = s.session_data?.interviewProfileId
          if (pid) setInterviewProfile(getProfileById(pid))
          setInterviewKey((k) => k + 1)
          setPage('interview')
        } else {
          clearActiveRoute()
        }
      })
      .catch(() => clearActiveRoute())
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per login / reload bootstrap
  }, [user?.id, isCandidate])

  useEffect(() => {
    if (isCandidate && page === 'recruiter') setPage('home')
  }, [page, isCandidate])

  const showToast = (message, type = 'info') => setToast({ message, type })

  const loadRecruiterCandidates = useCallback(async () => {
    if (!isRecruiter) return
    setLoadingCandidates(true)
    setRecruiterLoadError(null)
    try {
      const list = await fetchRecruiterCandidates()
      setCandidates(list)
    } catch {
      setCandidates([])
      const msg = 'Could not load interview results. Check your connection and try again.'
      setRecruiterLoadError(msg)
      showToast(msg, 'error')
    } finally {
      setLoadingCandidates(false)
    }
  }, [isRecruiter])

  useEffect(() => {
    if (isRecruiter && user) loadRecruiterCandidates()
  }, [isRecruiter, user, loadRecruiterCandidates])

  const { connected: recruiterLive } = useRecruiterRealtime({
    enabled: isRecruiter && !!user,
    onEvent: async (event, data) => {
      if (
        event === RealtimeEvents.INTERVIEW_COMPLETED ||
        event === RealtimeEvents.REPORT_GENERATED
      ) {
        try {
          const list = await fetchRecruiterCandidates()
          setCandidates(list)
          setReviewCandidate((prev) => {
            if (!prev || prev.id !== data.sessionId) return prev
            const updated = list.find((c) => c.id === data.sessionId)
            return updated ? { ...prev, ...updated } : prev
          })
          if (event === RealtimeEvents.INTERVIEW_COMPLETED) {
            showToast('New interview ready for review.', 'info')
          }
        } catch {
          /* keep existing list */
        }
      }
      if (
        event === RealtimeEvents.TRANSCRIPTION_PROGRESS &&
        data.sessionId &&
        reviewCandidateRef.current?.id === data.sessionId
      ) {
        setReviewCandidate((prev) => {
          if (!prev || prev.id !== data.sessionId) return prev
          return {
            ...prev,
            transcriptionStatus: data.status ?? prev.transcriptionStatus,
            transcriptionError: data.error ?? prev.transcriptionError,
          }
        })
      }
      if (
        event === RealtimeEvents.REPORT_GENERATED &&
        data.sessionId &&
        reviewCandidateRef.current?.id === data.sessionId
      ) {
        setReviewCandidate((prev) => {
          if (!prev || prev.id !== data.sessionId) return prev
          return {
            ...prev,
            serverTranscript: data.serverTranscript ?? prev.serverTranscript,
            transcriptionStatus: data.transcriptionStatus ?? prev.transcriptionStatus,
            report: data.report ? { ...prev.report, ...data.report } : prev.report,
          }
        })
      }
    },
  })

  const handleLogout = () => { logout(); setCompleteSummary(null); setCandidates([]) }

  const navigate = (target) => {
    if (isRecruiter && ['user', 'interview', 'complete'].includes(target)) return
    if (isCandidate && target === 'recruiter') return
    setPage(target)
  }

  const handleReviewAction = async (action, id) => {
    const decision = action === 'approve' ? 'Approved' : 'Rejected'
    try {
      const { candidate } = await updateRecruiterDecision(id, decision)
      setCandidates(prev => prev.map(c => c.id === id ? { ...c, ...candidate, flagged: candidate.flagged } : c))
      setReviewCandidate(null)
      showToast(action === 'approve' ? 'Candidate approved.' : 'Candidate rejected.', action === 'approve' ? 'success' : 'info')
    } catch { showToast('Could not save decision.', 'error') }
  }

  const handleRemoveCandidate = async (candidate) => {
    if (!window.confirm(`Remove ${candidate?.name ?? 'this candidate'} from your dashboard?`)) return
    try {
      await removeRecruiterCandidate(candidate.id)
      setCandidates(prev => prev.filter(c => c.id !== candidate.id))
      if (reviewCandidate?.id === candidate.id) setReviewCandidate(null)
      showToast('Candidate removed from list.', 'info')
    } catch { showToast('Could not remove candidate.', 'error') }
  }

  const handleInterviewComplete = async (result, { navigateImmediately = false } = {}) => {
    const profile = result.interviewProfile ?? interviewProfile
    const questions = result.questions ?? getQuestionTexts(profile)
    const backendFlags = (result.flags ?? []).map(f => typeof f === 'string' ? f : `${f.type} at ${f.at}`)
    const backend = { sessionId: result.sessionId }
    const report = generateInterviewReport({
      elapsed: result.elapsed, tabWarnings: result.tabWarnings,
      faceAbsenceWarnings: result.faceAbsenceWarnings, answers: result.answers,
      questions, keywords: profile.keywords, interviewTitle: profile.title,
      proctoringLog: result.proctoringLog ?? [], backend: { ...backend, flags: backendFlags },
    })

    const goToComplete = () => {
      setCompleteSummary({ interviewTitle: profile.title, durationFormatted: report.durationFormatted })
      navigate('complete')
      showToast('Interview submitted — processing recording in the background.', 'success')
    }

    if (navigateImmediately) {
      goToComplete()
    }

    const persist = async () => {
      const sessionId = result.sessionId ?? infra.session?.id
      if (!sessionId) {
        showToast('Could not submit interview — session not found.', 'error')
        return
      }
      try {
        const completed = await infra.finalizeSession({
          questionIndex: result.answers.length, answers: result.answers,
          tabWarnings: result.tabWarnings, faceAbsenceWarnings: result.faceAbsenceWarnings,
          proctoringLog: result.proctoringLog ?? [], elapsed: result.elapsed,
          flags: result.flags ?? [], status: 'completed', report, recruiterStatus: 'Review Pending',
          interviewProfileId: profile.id,
          interviewKeywords: profile.keywords ?? [],
          endedEarly: result.endedEarly ?? result.answers.length < questions.length,
        }, sessionId)
        report.fullTranscript = completed?.session_data?.transcription ?? null
        report.mergeStatus = completed?.session_data?.mergeStatus ?? 'pending'
      } catch {
        showToast('Interview saved locally; sync may complete when the server is back.', 'info')
      }
    }

    if (navigateImmediately) {
      persist()
      return
    }

    clearActiveRoute()
    await persist()
    goToComplete()
  }

  const handleStartInterview = async ({ hardwareCheck, interviewProfile: profile }) => {
    try {
      setInterviewProfile(profile)
      const session = await infra.initSession({ hardwareCheck, interviewProfile: profile })
      if (session?.id) saveActiveRoute({ page: 'interview', sessionId: session.id })
      setInterviewKey(k => k + 1)
      navigate('interview')
    } catch { showToast('Could not start session. Ensure the API server is running.', 'error') }
  }

  const handleResumeSession = (session) => {
    const pid = session.session_data?.interviewProfileId
    if (pid) setInterviewProfile(getProfileById(pid))
    if (session?.id) saveActiveRoute({ page: 'interview', sessionId: session.id })
    setInterviewKey(k => k + 1)
    navigate('interview')
  }

  const showHome = page === 'home'
  const showUser = page === 'user' && isCandidate
  const showInterview = page === 'interview' && isCandidate
  const showComplete = page === 'complete' && isCandidate
  const showRecruiter = page === 'recruiter' && isRecruiter
  const hasVisibleShell = showHome || showUser || showInterview || showComplete || showRecruiter

  if (!hasVisibleShell) {
    return (
      <>
        <InjectStyles />
        <div
          style={{
            minHeight: '100vh',
            background: '#04070f',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <div className="glass-card" style={{ maxWidth: 420, width: '100%', padding: 32, textAlign: 'center' }}>
            <h1 style={{ fontWeight: 800, fontSize: 22, color: '#e2e8f8', marginBottom: 10 }}>
              Session could not be loaded
            </h1>
            <p style={{ color: '#5a6485', fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
              Your account role is missing or invalid. Sign out and log in again.
            </p>
            <button type="button" onClick={handleLogout} className="btn-primary" style={{ width: '100%' }}>
              Return to login
            </button>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <InjectStyles />
      {showHome && (
        <LandingPage setPage={navigate} onWatchDemo={() => setShowDemo(true)} micStatus={micStatus} camStatus={camStatus} checkDevices={checkDevices} reportStream={reportStream} reportStreamEnded={reportStreamEnded} reportPermissionDenied={reportPermissionDenied} user={user} onLogout={handleLogout} />
      )}
      {showUser && (
        <UserDashboard setPage={navigate} onStartInterview={handleStartInterview} onResumeSession={handleResumeSession} micStatus={micStatus} camStatus={camStatus} checkDevices={checkDevices} reportStream={reportStream} reportStreamEnded={reportStreamEnded} reportPermissionDenied={reportPermissionDenied} infra={infra} user={user} onLogout={handleLogout} />
      )}
      {showInterview && (
        <InterviewErrorBoundary key={interviewKey} onBack={() => navigate('user')} onRetry={() => setInterviewKey(k => k + 1)}>
          <InterviewSession setPage={navigate} onComplete={handleInterviewComplete} reportStream={reportStream} infra={infra} interviewProfile={interviewProfile} />
        </InterviewErrorBoundary>
      )}
      {showComplete && (
        <InterviewCompletePage
          interviewTitle={completeSummary?.interviewTitle ?? interviewProfile.title}
          durationFormatted={completeSummary?.durationFormatted}
          setPage={navigate}
          pipeline={infra.pipelineRealtime}
          rtConnected={infra.rtConnected}
        />
      )}
      {showRecruiter && (
        <RecruiterDashboard setPage={navigate} candidates={candidates} loadingCandidates={loadingCandidates} loadError={recruiterLoadError} onRetryLoad={loadRecruiterCandidates} onReview={setReviewCandidate} onRemove={handleRemoveCandidate} onFilter={label => showToast(`Showing: ${label}`)} user={user} onLogout={handleLogout} liveConnected={recruiterLive} />
      )}
      <DemoModal open={showDemo} onClose={() => setShowDemo(false)} onTryDemo={() => navigate('user')} />
      <ReviewModal open={!!reviewCandidate} onClose={() => setReviewCandidate(null)} candidate={reviewCandidate} onAction={handleReviewAction} onRemove={handleRemoveCandidate} />
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  )
}
