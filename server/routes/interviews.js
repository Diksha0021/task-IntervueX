import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/asyncHandler.js'
import { findById, sanitize } from '../store/userStore.js'
import {
  listByRecruiter,
  findById as findInterviewById,
  findByInviteCode,
  createCustomInterview,
  updateCustomInterview,
  deleteCustomInterview,
  sanitizeForPublic,
  toClientProfile,
} from '../store/customInterviewStore.js'
import { INTERVIEW_TOPIC_OPTIONS } from '../config/interviewTopics.js'
import { AppError } from '../middleware/errorHandler.js'
import { env } from '../config/env.js'
import { listSessions } from '../store/sessionStore.js'

const router = Router()

function publicAppBase() {
  return (env.publicAppBaseUrl ?? 'http://localhost:5173').replace(/\/$/, '')
}

router.get('/topics', requireAuth, requireRole('recruiter'), (_req, res) => {
  res.json({ topics: INTERVIEW_TOPIC_OPTIONS })
})

router.get(
  '/',
  requireAuth,
  requireRole('recruiter'),
  asyncHandler(async (req, res) => {
    const allSessions = await listSessions()
    const interviews = listByRecruiter(req.user.id).map((i) => {
      const candidateCount = allSessions.filter(
        (s) =>
          s.session_data?.customInterviewId === i.id &&
          s.session_data?.recruiterId === req.user.id &&
          s.session_data?.report &&
          !s.session_data?.recruiterHidden
      ).length
      return {
        ...toClientProfile(i),
        inviteLink: `${publicAppBase()}/?invite=${i.inviteCode}`,
        candidateCount,
      }
    })
    res.json({ interviews })
  })
)

router.post(
  '/',
  requireAuth,
  requireRole('recruiter'),
  asyncHandler(async (req, res) => {
    const { title, roleLabel, durationMinutes, topics, customQuestions } = req.body ?? {}
    if (!title?.trim()) {
      throw new AppError('Interview title is required', 400)
    }
    if (!topics?.length && !customQuestions?.length) {
      throw new AppError('Select at least one topic or add a custom question', 400)
    }

    const interview = createCustomInterview(req.user.id, {
      title,
      roleLabel,
      durationMinutes,
      topics,
      customQuestions,
    })

    res.status(201).json({
      interview: {
        ...toClientProfile(interview),
        inviteLink: `${publicAppBase()}/?invite=${interview.inviteCode}`,
      },
    })
  })
)

router.patch(
  '/:id',
  requireAuth,
  requireRole('recruiter'),
  asyncHandler(async (req, res) => {
    const updated = updateCustomInterview(req.params.id, req.user.id, req.body ?? {})
    if (!updated) throw new AppError('Interview not found', 404)
    res.json({
      interview: {
        ...toClientProfile(updated),
        inviteLink: `${publicAppBase()}/?invite=${updated.inviteCode}`,
      },
    })
  })
)

router.delete(
  '/:id',
  requireAuth,
  requireRole('recruiter'),
  asyncHandler(async (req, res) => {
    const ok = deleteCustomInterview(req.params.id, req.user.id)
    if (!ok) throw new AppError('Interview not found', 404)
    res.json({ ok: true })
  })
)

/** Public preview for invite links (no auth). */
router.get(
  '/join/:inviteCode',
  asyncHandler(async (req, res) => {
    const interview = findByInviteCode(req.params.inviteCode)
    if (!interview) throw new AppError('Interview invite not found or expired', 404)

    const recruiter = sanitize(findById(interview.recruiterId))
    res.json({
      interview: sanitizeForPublic(interview, recruiter?.name ?? recruiter?.email),
      profile: toClientProfile(interview),
    })
  })
)

/** Candidate fetch after login (validates invite still active). */
router.get(
  '/join/:inviteCode/full',
  requireAuth,
  requireRole('candidate'),
  asyncHandler(async (req, res) => {
    const interview = findByInviteCode(req.params.inviteCode)
    if (!interview) throw new AppError('Interview invite not found or expired', 404)
    const recruiter = sanitize(findById(interview.recruiterId))
    res.json({
      profile: toClientProfile(interview),
      recruiterName: recruiter?.name ?? recruiter?.email ?? 'Recruiter',
    })
  })
)

export default router
