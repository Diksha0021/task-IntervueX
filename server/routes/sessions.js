import { Router } from 'express'
import { asyncHandler } from '../middleware/asyncHandler.js'
import { requireAuth } from '../middleware/auth.js'
import {
  validateCreateSession,
  validateSessionIdParam,
  validateUpdateSession,
} from '../middleware/validate.js'
import {
  createInterviewSession,
  getInterviewSession,
  updateInterviewSession,
  listInterviewSessions,
  completeInterviewSession,
  retryInterviewTranscription,
} from '../controllers/sessionController.js'

const router = Router()

router.post('/', requireAuth, validateCreateSession, asyncHandler(createInterviewSession))

router.get('/', asyncHandler(listInterviewSessions))

router.get('/:id', validateSessionIdParam, asyncHandler(getInterviewSession))

router.patch(
  '/:id',
  validateSessionIdParam,
  validateUpdateSession,
  asyncHandler(updateInterviewSession)
)

router.post(
  '/:id/complete',
  requireAuth,
  validateSessionIdParam,
  asyncHandler(completeInterviewSession)
)

router.post(
  '/:id/retry-transcription',
  requireAuth,
  validateSessionIdParam,
  asyncHandler(retryInterviewTranscription)
)

export default router
