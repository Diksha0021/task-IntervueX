import { processChunkUpload } from '../services/chunkUploadService.js'
import { listChunksForSession } from '../services/chunkRepository.js'
import { getSession } from '../store/sessionStore.js'
import * as chunkStore from '../store/chunkStore.js'
import { AppError } from '../middleware/errorHandler.js'
import { log } from '../utils/logger.js'

export async function uploadChunk(req, res) {
  if (!req.file) {
    throw new AppError('No chunk file provided', 400)
  }

  if (req.chunkIdGenerated) {
    log('debug', 'chunkId generated server-side', {
      sessionId: req.chunkUpload.sessionId,
      chunkId: req.chunkUpload.chunkId,
      sequenceNumber: req.chunkUpload.sequenceNumber,
    })
  }

  try {
    const result = await processChunkUpload({
      ...req.chunkUpload,
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      filename: req.file.originalname,
    })

    res.json(result)
  } catch (err) {
    log('error', 'Chunk upload handler failed', {
      sessionId: req.chunkUpload?.sessionId,
      chunkId: req.chunkUpload?.chunkId,
      sequenceNumber: req.chunkUpload?.sequenceNumber,
      error: err.message,
      status: err.status ?? err.statusCode,
    })
    throw err
  }
}

export async function uploadChunkLegacy(req, res) {
  if (!req.file) {
    throw new AppError('No chunk file provided', 400)
  }

  const session = await getSession(req.params.sessionId)
  if (!session) {
    throw new AppError('Session not found', 404)
  }

  const result = await processChunkUpload({
    sessionId: req.chunkUpload.sessionId,
    chunkId: req.chunkUpload.chunkId,
    sequenceNumber: req.chunkUpload.sequenceNumber,
    timestamp: req.chunkUpload.timestamp,
    buffer: req.file.buffer,
    mimeType: req.file.mimetype,
    filename: req.file.originalname,
  })

  res.json({
    ok: result.ok,
    success: result.success,
    duplicate: result.duplicate,
    key: result.key,
    sequence: result.sequenceNumber,
    chunkId: result.chunkId,
    timestamp: result.timestamp,
    session: result.session,
  })
}

export async function listSessionChunks(req, res) {
  const { sessionId } = req.params
  const session = await getSession(sessionId)
  if (!session) {
    throw new AppError('Session not found', 404)
  }

  const records = await listChunksForSession(sessionId)
  const keys = chunkStore.listChunks(sessionId)

  res.json({
    sessionId,
    chunks: keys,
    records,
    chunkCount: records.length || keys.length,
  })
}
