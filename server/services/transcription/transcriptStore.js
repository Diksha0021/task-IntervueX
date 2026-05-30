import { isMongoConnected } from '../../config/db.js'
import InterviewTranscript from '../../models/InterviewTranscript.js'
import { updateSession } from '../../store/sessionStore.js'
import { emitReportGenerated } from '../realtimeEvents.js'

/**
 * Persist transcript text linked to an interview session (Mongo + session_data).
 */
export async function saveSessionTranscript(sessionId, payload) {
  const {
    text,
    provider,
    language = null,
    durationMs = 0,
    status = 'done',
    error = null,
    attempts = 1,
    segments = null,
  } = payload

  if (isMongoConnected()) {
    await InterviewTranscript.findOneAndUpdate(
      { sessionId },
      {
        $set: {
          text,
          provider,
          language,
          durationMs,
          status,
          error,
          attempts,
          segments,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
  }

  const session = await updateSession(sessionId, {
    transcription: text,
    transcriptionStatus: status,
    transcriptionProvider: provider,
    transcriptionLanguage: language,
    transcriptionDurationMs: durationMs,
    transcriptionError: error,
    transcriptionAttempts: attempts,
    serverTranscript: text,
    transcriptionSegments: segments,
  })

  if (status === 'done' && text && session?.session_data?.report) {
    const updated = await updateSession(sessionId, {
      report: {
        ...session.session_data.report,
        fullTranscript: text,
        serverTranscript: text,
        transcriptionStatus: 'done',
        transcriptionProvider: provider,
      },
    })
    emitReportGenerated(sessionId, {
      transcriptionStatus: 'done',
      serverTranscript: text,
      transcriptionProvider: provider,
      report: updated?.session_data?.report ?? null,
    })
    return updated
  }

  if (status === 'done' && text) {
    emitReportGenerated(sessionId, {
      transcriptionStatus: 'done',
      serverTranscript: text,
      transcriptionProvider: provider,
    })
  }

  return session
}

export async function getSessionTranscript(sessionId) {
  if (isMongoConnected()) {
    const doc = await InterviewTranscript.findOne({ sessionId }).lean()
    if (doc) {
      return {
        sessionId: doc.sessionId,
        text: doc.text,
        provider: doc.provider,
        language: doc.language,
        status: doc.status,
        error: doc.error,
        attempts: doc.attempts,
        durationMs: doc.durationMs,
        segments: doc.segments,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      }
    }
  }

  const { getSession } = await import('../../store/sessionStore.js')
  const session = await getSession(sessionId)
  if (!session) return null

  const sd = session.session_data ?? {}
  if (!sd.transcription && !sd.serverTranscript) return null

  return {
    sessionId,
    text: sd.serverTranscript ?? sd.transcription ?? '',
    provider: sd.transcriptionProvider ?? 'unknown',
    language: sd.transcriptionLanguage ?? null,
    status: sd.transcriptionStatus ?? 'pending',
    error: sd.transcriptionError ?? null,
    attempts: sd.transcriptionAttempts ?? 0,
    durationMs: sd.transcriptionDurationMs ?? 0,
    segments: sd.transcriptionSegments ?? null,
  }
}

export async function markTranscriptProcessing(sessionId, attempts) {
  if (isMongoConnected()) {
    await InterviewTranscript.findOneAndUpdate(
      { sessionId },
      {
        $set: { status: 'processing', attempts, error: null },
      },
      { upsert: true, setDefaultsOnInsert: true }
    )
  }
  await updateSession(sessionId, {
    transcriptionStatus: 'processing',
    transcriptionAttempts: attempts,
    transcriptionError: null,
  })
}

export async function markTranscriptFailed(sessionId, { error, attempts }) {
  if (isMongoConnected()) {
    await InterviewTranscript.findOneAndUpdate(
      { sessionId },
      {
        $set: { status: 'failed', error, attempts },
      },
      { upsert: true, setDefaultsOnInsert: true }
    )
  }
  await updateSession(sessionId, {
    transcriptionStatus: 'failed',
    transcriptionError: error,
    transcriptionAttempts: attempts,
  })
}
