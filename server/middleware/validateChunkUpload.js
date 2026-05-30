import { AppError } from './errorHandler.js'
import { buildChunkId } from '../utils/chunkId.js'

/**
 * Parse and validate multipart chunk upload fields.
 * Attaches req.chunkUpload with normalized payload.
 */
export function validateChunkUpload(req, _res, next) {
  const sessionId = (req.body.sessionId ?? req.params.sessionId ?? '').trim()

  const sequenceRaw =
    req.body.sequenceNumber ??
    req.body.chunkIndex ??
    req.body.sequence ??
    req.headers['x-chunk-sequence'] ??
    req.headers['x-chunk-index']

  const sequenceNumber = parseInt(sequenceRaw, 10)

  const timestampRaw = req.body.timestamp ?? req.headers['x-chunk-timestamp']
  const timestamp = timestampRaw ? new Date(timestampRaw) : null

  const providedChunkId = (req.body.chunkId ?? req.headers['x-chunk-id'] ?? '').trim()

  if (!sessionId) {
    return next(new AppError('sessionId is required', 400))
  }

  if (Number.isNaN(sequenceNumber) || sequenceNumber < 0) {
    return next(new AppError('sequenceNumber must be a non-negative integer', 400))
  }

  if (!timestamp || Number.isNaN(timestamp.getTime())) {
    return next(new AppError('timestamp is required and must be a valid ISO date', 400))
  }

  const chunkId = buildChunkId(sessionId, sequenceNumber, providedChunkId)

  if (!providedChunkId) {
    req.chunkIdGenerated = true
  }

  req.chunkUpload = {
    sessionId,
    chunkId,
    sequenceNumber,
    timestamp,
  }

  next()
}
