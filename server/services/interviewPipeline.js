import { log } from '../utils/logger.js'
import { updateSession, getSession } from '../store/sessionStore.js'
import { enqueueMerge } from '../queues/audioMergeQueue.js'
import { enqueueTranscription, scheduleTranscriptionRetry } from '../queues/transcriptionQueue.js'
import { emitTranscriptionProgress } from './realtimeEvents.js'
import { env } from '../config/env.js'

/**
 * Post-interview pipeline: merge uploaded chunks, then transcribe merged audio.
 * Merge failure is fatal; transcription failure is recorded but does not abort completion.
 */
export async function runPostInterviewPipeline(sessionId) {
  await updateSession(sessionId, { pipelineStatus: 'merging' })

  const session = await getSession(sessionId)
  const priorMerge = session?.session_data?.mergeStatus

  if (priorMerge !== 'done') {
    log('info', 'Pipeline: merging chunks', { sessionId })
    await enqueueMerge(sessionId)
  } else {
    log('info', 'Pipeline: merge already done, skipping', { sessionId })
  }

  await updateSession(sessionId, { pipelineStatus: 'transcribing' })
  emitTranscriptionProgress(sessionId, {
    status: 'queued',
    progress: 0,
    message: 'Transcription queued',
  })
  log('info', 'Pipeline: starting transcription', { sessionId })

  try {
    await enqueueTranscription(sessionId)
    await updateSession(sessionId, { pipelineStatus: 'done', pipelineError: null })
    log('info', 'Pipeline complete', { sessionId })
  } catch (err) {
    const message = err?.message ?? 'Transcription failed'
    await updateSession(sessionId, {
      pipelineStatus: 'partial',
      pipelineError: message,
    })
    log('warn', 'Pipeline: transcription failed (merge succeeded)', {
      sessionId,
      error: message,
    })
    scheduleTranscriptionRetry(sessionId, env.transcription.retryMaxDelayMs)
  }
}

/**
 * Re-run transcription for a session that already has a merged recording.
 */
export async function retrySessionTranscription(sessionId) {
  await updateSession(sessionId, {
    transcriptionStatus: 'pending',
    transcriptionError: null,
  })
  return enqueueTranscription(sessionId)
}
