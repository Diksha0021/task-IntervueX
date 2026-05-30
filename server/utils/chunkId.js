/**
 * Build a stable chunkId for a session upload.
 * Clients may send chunkId; otherwise derive from session + sequence.
 */
export function buildChunkId(sessionId, sequenceNumber, providedChunkId) {
  const explicit = providedChunkId?.trim()
  if (explicit) return explicit
  return `${sessionId}::seq::${sequenceNumber}`
}

export function storageKeyForSequence(sequenceNumber) {
  return `chunk_${String(sequenceNumber).padStart(3, '0')}.webm`
}
