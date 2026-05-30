import { getSession, createSession, updateSession, listSessions } from '../store/sessionStore.js'
import { runPostInterviewPipeline, retrySessionTranscription } from '../services/interviewPipeline.js'
import {
  emitInterviewCompleted,
  emitReportGenerated,
} from '../services/realtimeEvents.js'
import { generateAndSaveSessionAnalytics } from '../services/analytics/index.js'
import { getKeywordsForProfile } from '../config/interviewProfiles.js'
import { log } from '../utils/logger.js'
import { AppError } from '../middleware/errorHandler.js'

export async function createInterviewSession(req, res) {
  const {
    hardwareCheck,
    resumeFrom,
    interviewProfileId,
    interviewTitle,
    durationMinutes,
    questions,
  } = req.body ?? {}

  if (req.user.role !== 'candidate') {
    throw new AppError('Only candidates can start interviews', 403)
  }

  if (resumeFrom) {
    const existing = await getSession(resumeFrom)
    if (
      existing &&
      existing.session_data?.status !== 'completed' &&
      existing.userId === req.user.id
    ) {
      const patch = {
        interviewProfileId: interviewProfileId ?? existing.session_data?.interviewProfileId,
        interviewTitle: interviewTitle ?? existing.session_data?.interviewTitle,
        durationMinutes: durationMinutes ?? existing.session_data?.durationMinutes,
        questions: questions ?? existing.session_data?.questions,
        lastResumedAt: new Date().toISOString(),
      }
      const updated = await updateSession(resumeFrom, patch)
      log('info', 'Session resumed', { sessionId: resumeFrom })
      return res.json(updated ?? existing)
    }
  }

  const session = await createSession(
    {
      hardwareCheck: hardwareCheck ?? { camera: false, microphone: false },
      interviewProfileId,
      interviewTitle,
      durationMinutes,
      questions,
      interviewKeywords: getKeywordsForProfile(interviewProfileId),
    },
    {
      userId: req.user.id,
      userEmail: req.user.email,
      candidateName: req.user.name ?? req.user.email?.split('@')[0],
    }
  )

  log('info', 'Session created', { sessionId: session.id, userId: req.user.id })
  res.status(201).json(session)
}

export async function getInterviewSession(req, res) {
  const session = await getSession(req.params.id)
  if (!session) throw new AppError('Session not found', 404)
  res.json(session)
}

export async function updateInterviewSession(req, res) {
  const session = await updateSession(req.params.id, req.body)
  if (!session) throw new AppError('Session not found', 404)
  res.json(session)
}

export async function listInterviewSessions(_req, res) {
  const sessions = await listSessions()
  res.json(sessions)
}

export async function completeInterviewSession(req, res) {
  const session = await getSession(req.params.id)
  if (!session) throw new AppError('Session not found', 404)

  if (session.userId && session.userId !== req.user.id) {
    throw new AppError('Access denied', 403)
  }

  const incoming = req.body?.session_data ?? {}
  const reportPayload = incoming.report ?? session.session_data?.report
  await updateSession(req.params.id, {
    status: 'processing',
    ...incoming,
    report: reportPayload,
  })

  if (reportPayload) {
    try {
      const { analytics } = await generateAndSaveSessionAnalytics(req.params.id, {
        report: reportPayload,
        incoming,
      })
      reportPayload.analytics = analytics
    } catch (err) {
      log('warn', 'Analytics generation failed', {
        sessionId: req.params.id,
        error: err.message,
      })
    }

    emitReportGenerated(req.params.id, {
      report: reportPayload,
      recruiterStatus: incoming.recruiterStatus ?? 'Review Pending',
    })
  }

  const updated = await updateSession(req.params.id, {
    status: 'completed',
    completedAt: new Date().toISOString(),
    pipelineStatus: 'queued',
  })

  emitInterviewCompleted(req.params.id, {
    status: 'completed',
    mergeStatus: updated?.session_data?.mergeStatus ?? 'pending',
    transcriptionStatus: updated?.session_data?.transcriptionStatus ?? 'pending',
    pipelineStatus: 'queued',
    userId: updated?.userId,
  })

  runPostInterviewPipeline(req.params.id).catch((err) => {
    log('error', 'Post-interview pipeline failed (background)', {
      sessionId: req.params.id,
      error: err.message,
    })
    updateSession(req.params.id, {
      pipelineStatus: 'failed',
      pipelineError: err.message,
      mergeStatus: 'failed',
      mergeError: err.message,
    }).catch(() => {})
  })

  res.json(updated)
}

export async function retryInterviewTranscription(req, res) {
  const session = await getSession(req.params.id)
  if (!session) throw new AppError('Session not found', 404)

  if (req.user.role !== 'recruiter' && session.userId !== req.user.id) {
    throw new AppError('Access denied', 403)
  }

  if (session.session_data?.mergeStatus !== 'done') {
    throw new AppError('Recording merge must complete before transcription', 409)
  }

  try {
    const result = await retrySessionTranscription(req.params.id)
    res.json({ ok: true, result })
  } catch (err) {
    throw new AppError(err.message ?? 'Transcription retry failed', 500)
  }
}
