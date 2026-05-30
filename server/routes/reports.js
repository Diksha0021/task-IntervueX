import { Router } from 'express'
import { listSessions, getSession, updateSession } from '../store/sessionStore.js'
import { findById, sanitize } from '../store/userStore.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/asyncHandler.js'
import { resolvePublicRecordingUrl } from '../services/storage/index.js'
import { recoverStuckSessionIfNeeded } from '../services/recoverStuckSession.js'

const router = Router()

function isCandidateFlagged(c) {
  if (!c) return false
  if (c.status === 'Approved' || c.status === 'Rejected') return false
  if (c.status === 'Flagged') return true
  if (c.flagged || c.report?.flagged) return true
  const rec = (c.recommendation ?? '').toLowerCase()
  if (rec.includes('flagged') || rec.includes('incomplete') || rec.includes('needs review')) {
    return true
  }
  if ((c.tabWarnings ?? 0) > 0 || (c.faceAbsenceWarnings ?? 0) > 0) return true
  if ((c.flagsList?.length ?? c.report?.flags?.length ?? 0) > 0) return true
  if ((c.integrityScore ?? 10) < 7) return true
  const total = c.report?.questionsTotal ?? 6
  const answered = c.report?.questionsAnswered ?? 0
  if (answered < total) return true
  return false
}

function sessionToCandidate(session) {
  const sd = session.session_data ?? {}
  const report = sd.report
  if (!report) return null

  const user = session.userId ? sanitize(findById(session.userId)) : null
  const name =
    session.candidateName ??
    user?.name ??
    user?.email?.split('@')[0] ??
    sd.userEmail?.split('@')[0] ??
    'Candidate'
  const email = user?.email ?? sd.userEmail ?? ''

  const tabWarnings = report.tabWarnings ?? sd.tabWarnings ?? 0
  const faceAbsenceWarnings = report.faceAbsenceWarnings ?? sd.faceAbsenceWarnings ?? 0
  const integrityScore = report.integrityScore ?? report.scores?.integrity ?? 10
  const flagCount = tabWarnings + faceAbsenceWarnings + (report.flags?.length ?? 0)
  const recruiterStatus = sd.recruiterStatus ?? 'Review Pending'

  return {
    id: session.id,
    sessionId: session.id,
    name,
    email,
    role: report.interviewTitle ?? sd.interviewTitle ?? 'Interview',
    interviewProfileId: sd.interviewProfileId,
    communication: report.scores?.communication ?? 0,
    technical: report.scores?.technical ?? 0,
    overall: report.scores?.overall ?? 0,
    integrityScore,
    tabWarnings,
    faceAbsenceWarnings,
    substantiveAnswerCount: report.substantiveAnswerCount ?? 0,
    flags: flagCount,
    status: recruiterStatus,
    transcript: report.summary ?? session.session_data?.transcription ?? '',
    serverTranscript:
      session.session_data?.serverTranscript ??
      session.session_data?.transcription ??
      report.fullTranscript ??
      '',
    transcriptionStatus: session.session_data?.transcriptionStatus ?? 'pending',
    transcriptionProvider: session.session_data?.transcriptionProvider ?? null,
    transcriptionError: session.session_data?.transcriptionError ?? null,
    flagsList: (report.flags ?? sd.flags ?? []).map((f) =>
      typeof f === 'string' ? f : JSON.stringify(f)
    ),
    proctoringLog: report.proctoringLog ?? sd.proctoringLog ?? [],
    completedAt: report.completedAt ?? session.completedAt,
    durationFormatted: report.durationFormatted,
    recommendation: report.recommendation,
    chunkCount: sd.chunkCount ?? 0,
    mergeStatus: sd.mergeStatus ?? 'pending',
    recordingUrl: resolvePublicRecordingUrl(session),
    analytics: session.session_data?.analytics ?? report.analytics ?? null,
    confidenceScore:
      session.session_data?.analytics?.confidenceScore ??
      report.scores?.confidence ??
      null,
    keywordMatchScore:
      session.session_data?.analytics?.keywordMatchScore ?? null,
    flagged: report.flagged ?? isCandidateFlagged({
      status: recruiterStatus,
      recommendation: report.recommendation,
      tabWarnings,
      faceAbsenceWarnings,
      integrityScore,
      flagsList: report.flags,
      report,
    }),
    report,
  }
}

router.get('/', requireAuth, requireRole('recruiter'), asyncHandler(async (_req, res) => {
  const rawSessions = await listSessions()
  const sessions = await Promise.all(
    rawSessions.map((s) => recoverStuckSessionIfNeeded(s))
  )
  const candidates = sessions
    .filter(
      (s) =>
        !s.session_data?.recruiterHidden &&
        s.session_data?.report &&
        s.userId &&
        (s.session_data?.status === 'completed' || s.session_data?.status === 'processing')
    )
    .map(sessionToCandidate)
    .filter(Boolean)
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))

  res.json({ candidates })
}))

router.get('/:id', requireAuth, requireRole('recruiter'), asyncHandler(async (req, res) => {
  const session = await getSession(req.params.id)
  if (!session?.session_data?.report) {
    return res.status(404).json({ error: 'Interview report not found' })
  }
  const candidate = sessionToCandidate(session)
  if (!candidate) return res.status(404).json({ error: 'Interview report not found' })
  res.json({ candidate })
}))

router.patch('/:id/decision', requireAuth, requireRole('recruiter'), asyncHandler(async (req, res) => {
  const { decision } = req.body ?? {}
  const allowed = ['Review Pending', 'Approved', 'Rejected', 'Flagged']
  if (!allowed.includes(decision)) {
    return res.status(400).json({ error: 'Invalid decision' })
  }

  const session = await getSession(req.params.id)
  if (!session?.session_data?.report) {
    return res.status(404).json({ error: 'Interview report not found' })
  }

  const updated = await updateSession(req.params.id, { recruiterStatus: decision })
  res.json({ candidate: sessionToCandidate(updated) })
}))

router.delete('/:id', requireAuth, requireRole('recruiter'), asyncHandler(async (req, res) => {
  const session = await getSession(req.params.id)
  if (!session?.session_data?.report) {
    return res.status(404).json({ error: 'Interview report not found' })
  }

  await updateSession(req.params.id, {
    recruiterHidden: true,
    recruiterHiddenAt: new Date().toISOString(),
  })
  res.json({ ok: true })
}))

export default router
