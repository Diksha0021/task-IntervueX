import { isMongoConnected } from '../config/db.js'
import {
  createMongoSession,
  getMongoSession,
  updateMongoSession,
  listMongoSessions,
  addChunkMetadata,
} from '../services/sessionService.js'
import {
  createFileSession,
  getFileSession,
  updateFileSession,
  listFileSessions,
} from './fileSessionStore.js'
import { buildInterviewTranscript } from '../utils/interviewTranscript.js'

function enrichSessionPatch(patch = {}) {
  if (!patch || typeof patch !== 'object') return patch

  const next = { ...patch }

  if (Array.isArray(patch.answers) || patch.liveTranscript != null) {
    const transcript = buildInterviewTranscript({
      answers: patch.answers,
      liveTranscript: patch.liveTranscript ?? '',
      partialQuestion: patch.currentQuestion ?? null,
    })
    if (transcript) {
      next.transcription = transcript
    }
  }

  return next
}

/**
 * Unified session store — MongoDB when connected, JSON file fallback otherwise.
 * All methods are async for a consistent API across both backends.
 */

export async function createSession(initial = {}, meta = {}) {
  if (isMongoConnected()) {
    return createMongoSession(initial, meta)
  }
  return createFileSession(initial, meta)
}

export async function getSession(id) {
  if (isMongoConnected()) {
    return getMongoSession(id)
  }
  return getFileSession(id)
}

export async function updateSession(id, patch) {
  const enriched = enrichSessionPatch(patch)
  if (isMongoConnected()) {
    return updateMongoSession(id, enriched)
  }
  return updateFileSession(id, enriched)
}

export async function listSessions(filter) {
  if (isMongoConnected()) {
    return listMongoSessions(filter)
  }
  return listFileSessions()
}

export async function saveChunkMetadata(sessionId, chunkMeta, options) {
  if (isMongoConnected()) {
    return addChunkMetadata(sessionId, chunkMeta, options)
  }

  const session = getFileSession(sessionId)
  if (!session) return null

  const uploadedKeys = [
    ...new Set([...(session.session_data.uploadedChunkKeys ?? []), chunkMeta.key]),
  ].sort()

  return updateFileSession(sessionId, {
    chunkSequence: Math.max(session.session_data.chunkSequence ?? 0, chunkMeta.chunkIndex + 1),
    uploadedChunkKeys: uploadedKeys,
    lastChunkAt: chunkMeta.timestamp,
    lastChunkIndex: chunkMeta.chunkIndex,
    chunkCount: options?.duplicate
      ? session.session_data.chunkCount ?? 0
      : (session.session_data.chunkCount ?? 0) + 1,
  })
}
