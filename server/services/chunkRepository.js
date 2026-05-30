import { isMongoConnected } from '../config/db.js'
import InterviewChunk from '../models/InterviewChunk.js'
import * as chunkManifest from '../store/chunkManifestStore.js'

/**
 * Find an existing chunk by sessionId + chunkId (duplicate detection).
 */
export async function findChunkByChunkId(sessionId, chunkId) {
  if (isMongoConnected()) {
    return InterviewChunk.findOne({ sessionId, chunkId }).lean()
  }
  return chunkManifest.findChunkByChunkId(sessionId, chunkId)
}

/**
 * Persist chunk metadata after file is saved on disk.
 */
export async function registerChunkRecord(record) {
  if (isMongoConnected()) {
    const doc = await InterviewChunk.create(record)
    return doc.toObject()
  }

  const { duplicate, record: saved } = chunkManifest.registerChunk(record.sessionId, {
    chunkId: record.chunkId,
    sequenceNumber: record.sequenceNumber,
    timestamp: record.timestamp,
    storageKey: record.storageKey,
    storagePath: record.storagePath,
    size: record.size,
    mimeType: record.mimeType,
  })

  if (duplicate) return saved
  return saved
}

export async function listChunksForSession(sessionId) {
  if (isMongoConnected()) {
    return InterviewChunk.find({ sessionId }).sort({ sequenceNumber: 1 }).lean()
  }
  return chunkManifest.listChunkRecords(sessionId)
}
