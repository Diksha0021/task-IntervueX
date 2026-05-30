import { updateSession } from '../store/sessionStore.js'
import { runPostInterviewPipeline } from './interviewPipeline.js'
import { generateAndSaveSessionAnalytics } from './analytics/index.js'
import {
  emitInterviewCompleted,
  emitReportGenerated,
} from './realtimeEvents.js'
import { log } from '../utils/logger.js'

const STALE_SESSION_MS = 90_000

function isSubstantive(text) {
  const t = (text ?? '').trim()
  return t.length > 20 && !/^(no verbal|n\/a|\(no response)/i.test(t)
}

function buildRecoveryReport(session) {
  const sd = session.session_data ?? {}
  const answers = sd.answers ?? []
  const questions = sd.questions ?? answers.map((a) => a.question)
  const total = questions.length || 6
  const elapsed = sd.elapsed ?? 0
  const tabWarnings = sd.tabWarnings ?? 0
  const faceAbsenceWarnings = sd.faceAbsenceWarnings ?? 0
  const substantive = answers.filter((a) => isSubstantive(a.answer))
  const incomplete = answers.length < total

  let integrityScore = 10
  integrityScore -= Math.min(tabWarnings * 2.5, 6)
  integrityScore -= Math.min(faceAbsenceWarnings * 1.5, 5)
  if (incomplete) integrityScore -= Math.min((total - answers.length) * 1.5, 4)
  integrityScore = Math.max(0, Math.min(10, Math.round(integrityScore)))

  const flags = []
  if (tabWarnings > 0) flags.push(`Tab switched away ${tabWarnings} time(s)`)
  if (faceAbsenceWarnings > 0) flags.push(`Face not visible ${faceAbsenceWarnings} time(s)`)
  if (incomplete) {
    flags.push(`Only ${answers.length} of ${total} questions were submitted`)
  }
  if (sd.endedEarly) {
    flags.push('Interview ended early by candidate')
  }

  let recommendation = 'Review Pending'
  if (incomplete || tabWarnings > 0 || faceAbsenceWarnings > 0) {
    if (incomplete && (tabWarnings > 0 || faceAbsenceWarnings > 0)) {
      recommendation = 'Flagged — proctoring and incomplete submission'
    } else if (incomplete) {
      recommendation = 'Flagged — incomplete submission'
    } else {
      recommendation = 'Flagged — proctoring concerns'
    }
  }

  return {
    id: `RPT-${Date.now()}`,
    sessionId: session.id,
    interviewTitle: sd.interviewTitle ?? 'Interview',
    completedAt: new Date().toISOString(),
    duration: elapsed,
    durationFormatted: `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`,
    questionsTotal: total,
    questionsAnswered: answers.length,
    substantiveAnswerCount: substantive.length,
    emptyAnswerCount: answers.length - substantive.length,
    completionRate: Math.round((substantive.length / total) * 100),
    scores: {
      communication: substantive.length ? 6 : 0,
      technical: substantive.length ? 6 : 0,
      overall: substantive.length ? 6 : 0,
      integrity: integrityScore,
    },
    tabWarnings,
    faceAbsenceWarnings,
    integrityScore,
    proctoringLog: sd.proctoringLog ?? [],
    flags,
    flagged: flags.length > 0 || incomplete,
    recommendation,
    summary: incomplete
      ? `Recovered early-ended report: ${answers.length}/${total} questions answered.`
      : `Recovered report: ${substantive.length}/${total} substantive answers.`,
    strengths: [],
    improvements: incomplete ? ['Interview was submitted before all questions were completed'] : [],
    perQuestion: answers.map((a, i) => ({
      index: i + 1,
      question: a.question,
      answer: a.answer,
      substantive: isSubstantive(a.answer),
    })),
    answers,
    mergeStatus: sd.mergeStatus ?? 'pending',
    transcriptionStatus: sd.transcriptionStatus ?? 'pending',
    endedEarly: sd.endedEarly ?? incomplete,
    recovered: true,
  }
}

function shouldRecoverSession(session) {
  const sd = session.session_data ?? {}
  if (sd.report || sd.status === 'completed' || sd.status === 'processing') {
    return false
  }
  if (!session.userId) return false

  const answered = sd.answers?.length ?? 0
  if (answered === 0) return false

  const total = sd.questions?.length ?? 6
  const allAnswered = answered >= total
  if (allAnswered) return true

  if (sd.endedEarly === true || sd.submittedAt) return true

  const lastActivity = new Date(sd.lastCheckpointAt ?? session.updatedAt ?? 0).getTime()
  return Date.now() - lastActivity >= STALE_SESSION_MS
}

/**
 * Promote sessions that submitted (including early end) but never reached /complete.
 */
export async function recoverStuckSessionIfNeeded(session) {
  if (!shouldRecoverSession(session)) return session

  const sd = session.session_data ?? {}
  const report = buildRecoveryReport(session)

  try {
    const { analytics } = await generateAndSaveSessionAnalytics(session.id, {
      report,
      incoming: sd,
    })
    report.analytics = analytics
  } catch (err) {
    log('warn', 'Analytics failed during stuck session recovery', {
      sessionId: session.id,
      error: err.message,
    })
  }

  const updated = await updateSession(session.id, {
    status: 'completed',
    report,
    completedAt: new Date().toISOString(),
    recruiterStatus: sd.recruiterStatus ?? 'Review Pending',
    pipelineStatus: 'queued',
    endedEarly: report.endedEarly,
  })

  emitReportGenerated(session.id, {
    report,
    recruiterStatus: sd.recruiterStatus ?? 'Review Pending',
  })
  emitInterviewCompleted(session.id, {
    status: 'completed',
    mergeStatus: updated?.session_data?.mergeStatus ?? 'pending',
    transcriptionStatus: updated?.session_data?.transcriptionStatus ?? 'pending',
    pipelineStatus: 'queued',
    userId: updated?.userId,
  })

  runPostInterviewPipeline(session.id).catch((err) => {
    log('error', 'Post-interview pipeline failed after recovery', {
      sessionId: session.id,
      error: err.message,
    })
  })

  log('info', 'Recovered stuck interview session for recruiter dashboard', {
    sessionId: session.id,
    answers: sd.answers?.length ?? 0,
    endedEarly: report.endedEarly,
  })

  return updated ?? session
}
