import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/asyncHandler.js'
import { getSession } from '../store/sessionStore.js'
import { getSessionTranscript } from '../services/transcription/index.js'
import { retrySessionTranscription } from '../services/interviewPipeline.js'
import { AppError } from '../middleware/errorHandler.js'

const router = Router()

router.get(
  '/:sessionId',
  requireAuth,
  requireRole('recruiter'),
  asyncHandler(async (req, res) => {
    const session = await getSession(req.params.sessionId)
    if (!session) {
      throw new AppError('Session not found', 404)
    }

    const transcript = await getSessionTranscript(req.params.sessionId)
    if (!transcript?.text) {
      return res.status(404).json({
        error: 'Transcript not available',
        transcriptionStatus: session.session_data?.transcriptionStatus ?? 'pending',
      })
    }

    res.json({
      sessionId: req.params.sessionId,
      transcript,
      transcriptionStatus: session.session_data?.transcriptionStatus,
      mergeStatus: session.session_data?.mergeStatus,
    })
  })
)

router.post(
  '/:sessionId/retry',
  requireAuth,
  requireRole('recruiter'),
  asyncHandler(async (req, res) => {
    const session = await getSession(req.params.sessionId)
    if (!session) throw new AppError('Session not found', 404)

    if (session.session_data?.mergeStatus !== 'done') {
      throw new AppError('Recording merge must complete before transcription', 409)
    }

    const result = await retrySessionTranscription(req.params.sessionId)
    res.json({ ok: true, result })
  })
)

export default router
