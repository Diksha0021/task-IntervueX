import { Router } from 'express'
import { asyncHandler } from '../middleware/asyncHandler.js'
import { requireAuth } from '../middleware/auth.js'
import { listAllCandidates, getCandidate } from '../controllers/candidateController.js'

const router = Router()

router.get('/', requireAuth, asyncHandler(listAllCandidates))
router.get('/:userId', requireAuth, asyncHandler(getCandidate))

export default router
