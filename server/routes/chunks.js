import { Router } from 'express'
import multer from 'multer'
import { asyncHandler } from '../middleware/asyncHandler.js'
import { validateChunkUpload } from '../middleware/validateChunkUpload.js'
import { validateSessionIdParam } from '../middleware/validate.js'
import {
  uploadChunk,
  uploadChunkLegacy,
  listSessionChunks,
} from '../controllers/chunkController.js'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
})

const router = Router()

/**
 * POST /api/chunks/upload
 * Multipart: sessionId, chunkId, sequenceNumber, timestamp, chunk (file)
 * Legacy aliases: chunkIndex → sequenceNumber
 */
router.post(
  '/upload',
  upload.single('chunk'),
  validateChunkUpload,
  asyncHandler(uploadChunk)
)

/** Legacy route — kept for backward compatibility */
router.post(
  '/:sessionId',
  upload.single('chunk'),
  validateChunkUpload,
  asyncHandler(uploadChunkLegacy)
)

router.get(
  '/:sessionId',
  validateSessionIdParam,
  asyncHandler(listSessionChunks)
)

export default router
