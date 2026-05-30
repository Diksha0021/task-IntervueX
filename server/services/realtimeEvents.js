import { getIO } from '../websocket/socketServer.js'

/** Socket.IO event names (shared contract with frontend). */
export const RealtimeEvents = {
  CHUNK_UPLOADED: 'chunk_uploaded',
  TRANSCRIPTION_PROGRESS: 'transcription_progress',
  INTERVIEW_COMPLETED: 'interview_completed',
  REPORT_GENERATED: 'report_generated',
}

function basePayload(sessionId, extra = {}) {
  return {
    sessionId,
    ts: Date.now(),
    ...extra,
  }
}

/**
 * Emit to session room and recruiter dashboard room.
 */
export function emitSessionRealtime(sessionId, event, payload = {}) {
  const io = getIO()
  if (!io || !sessionId) return

  const data = basePayload(sessionId, payload)
  io.to(`session:${sessionId}`).emit(event, data)
  io.to('recruiters').emit(event, data)
}

export function emitChunkUploaded(sessionId, details) {
  emitSessionRealtime(sessionId, RealtimeEvents.CHUNK_UPLOADED, details)
}

export function emitTranscriptionProgress(sessionId, details) {
  emitSessionRealtime(sessionId, RealtimeEvents.TRANSCRIPTION_PROGRESS, details)
}

export function emitInterviewCompleted(sessionId, details) {
  emitSessionRealtime(sessionId, RealtimeEvents.INTERVIEW_COMPLETED, details)
}

export function emitReportGenerated(sessionId, details) {
  emitSessionRealtime(sessionId, RealtimeEvents.REPORT_GENERATED, details)
}
