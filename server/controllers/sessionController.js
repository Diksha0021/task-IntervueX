import { getSession, createSession, updateSession, listSessions } from '../store/sessionStore.js'
import { runPostInterviewPipeline, retrySessionTranscription } from '../services/interviewPipeline.js'
import {
  emitInterviewCompleted,
  emitReportGenerated,
} from '../services/realtimeEvents.js'
import { generateAndSaveSessionAnalytics } from '../services/analytics/index.js'
import { getKeywordsForProfile } from '../config/interviewProfiles.js'
import { findByInviteCode, findById as findCustomInterview } from '../store/customInterviewStore.js'
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
    customInterviewId,
    inviteCode,
    recruiterId: bodyRecruiterId,
    interviewKeywords,
    topics,
  } = req.body ?? {}

  if (req.user.role !== 'candidate') {
    throw new AppError('Only candidates can start interviews', 403)
  }

  let customInterview = null
  if (inviteCode) {
    customInterview = findByInviteCode(inviteCode)
  } else if (customInterviewId) {
    customInterview = findCustomInterview(customInterviewId)
  }

  if (customInterview && customInterview.isActive === false) {
    throw new AppError('This interview is no longer accepting candidates', 410)
  }

  const resolvedProfileId = customInterview?.id ?? interviewProfileId
  const resolvedTitle = customInterview?.title ?? interviewTitle
  const resolvedDuration = customInterview?.durationMinutes ?? durationMinutes
  const resolvedQuestions =
    customInterview?.questions?.map((q) => (typeof q === 'string' ? q : q.text)) ??
    questions
  const resolvedKeywords =
    customInterview?.keywords ?? interviewKeywords ?? getKeywordsForProfile(interviewProfileId)
  const resolvedRecruiterId = customInterview?.recruiterId ?? bodyRecruiterId ?? null
  const resolvedTopics = customInterview?.topics ?? topics ?? []

  if (resumeFrom) {
    const existing = await getSession(resumeFrom)
    if (
      existing &&
      existing.session_data?.status !== 'completed' &&
      existing.userId === req.user.id
    ) {
      const patch = {
        interviewProfileId: resolvedProfileId ?? existing.session_data?.interviewProfileId,
        customInterviewId: customInterview?.id ?? existing.session_data?.customInterviewId,
        recruiterId: resolvedRecruiterId ?? existing.session_data?.recruiterId,
        interviewTitle: resolvedTitle ?? existing.session_data?.interviewTitle,
        durationMinutes: resolvedDuration ?? existing.session_data?.durationMinutes,
        questions: resolvedQuestions ?? existing.session_data?.questions,
        interviewKeywords: resolvedKeywords ?? existing.session_data?.interviewKeywords,
        topics: resolvedTopics.length ? resolvedTopics : existing.session_data?.topics,
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
      interviewProfileId: resolvedProfileId,
      customInterviewId: customInterview?.id ?? customInterviewId ?? null,
      recruiterId: resolvedRecruiterId,
      interviewTitle: resolvedTitle,
      durationMinutes: resolvedDuration,
      questions: resolvedQuestions,
      interviewKeywords: resolvedKeywords,
      topics: resolvedTopics,
    },
    {
      userId: req.user.id,
      userEmail: req.user.email,
      candidateName: req.user.name ?? req.user.email?.split('@')[0],
      recruiterId: resolvedRecruiterId,
    }
  )

  log('info', 'Session created', {
    sessionId: session.id,
    userId: req.user.id,
    recruiterId: resolvedRecruiterId,
    customInterviewId: customInterview?.id,
  })
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

  const recruiterId =
    incoming.recruiterId ?? session.session_data?.recruiterId ?? session.recruiterId ?? null

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
      recruiterId,
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
    recruiterId,
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
