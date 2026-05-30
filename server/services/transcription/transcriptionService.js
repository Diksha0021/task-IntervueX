import { existsSync } from 'fs'
import { log } from '../../utils/logger.js'
import { getSession } from '../../store/sessionStore.js'
import { getRecordingStorage } from '../storage/index.js'
import { env } from '../../config/env.js'
import { withRetry, isTransientHttpError } from '../../utils/retry.js'
import { transcribeAudioFile, resolveTranscriptionProvider } from './providers/index.js'
import {
  saveSessionTranscript,
  markTranscriptProcessing,
  markTranscriptFailed,
} from './transcriptStore.js'
import { emitTranscriptionProgress } from '../realtimeEvents.js'

function waitForMergedFile(sessionId, { timeoutMs = 60000, intervalMs = 500 } = {}) {
  const storage = getRecordingStorage()
  const mergedPath = storage.getLocalMergedPath(sessionId)

  return new Promise((resolve, reject) => {
    const started = Date.now()

    const check = () => {
      if (existsSync(mergedPath)) {
        resolve(mergedPath)
        return
      }
      if (Date.now() - started >= timeoutMs) {
        reject(new Error('Timed out waiting for merged recording'))
        return
      }
      setTimeout(check, intervalMs)
    }

    check()
  })
}

/**
 * Transcribe the merged interview recording and store results on the session.
 */
export async function transcribeSessionRecording(sessionId, { attemptOffset = 0 } = {}) {
  const started = Date.now()
  const session = await getSession(sessionId)
  if (!session) {
    throw new Error('Session not found')
  }

  const mergeStatus = session.session_data?.mergeStatus
  if (mergeStatus === 'failed') {
    throw new Error('Cannot transcribe: audio merge failed')
  }

  const provider = resolveTranscriptionProvider()
  const maxAttempts = env.transcription.maxAttempts

  let attempt = attemptOffset

  await markTranscriptProcessing(sessionId, attempt)
  emitTranscriptionProgress(sessionId, {
    status: 'processing',
    progress: 5,
    provider,
    attempt,
  })

  try {
    const answers = session.session_data?.answers ?? []
    let mergedPath = null

    if (provider !== 'mock') {
      emitTranscriptionProgress(sessionId, {
        status: 'processing',
        progress: 15,
        message: 'Waiting for merged recording',
        provider,
      })
      mergedPath = await waitForMergedFile(sessionId)
      emitTranscriptionProgress(sessionId, {
        status: 'processing',
        progress: 30,
        message: 'Merged recording ready',
        provider,
      })
    } else {
      const storage = getRecordingStorage()
      mergedPath = storage.getLocalMergedPath(sessionId)
      if (!existsSync(mergedPath)) {
        log('info', 'No merged file — using mock transcript from Q&A', { sessionId })
      }
    }

    const result = await withRetry(
      async (tryNum) => {
        attempt = attemptOffset + tryNum
        await markTranscriptProcessing(sessionId, attempt)
        const progress = Math.min(90, 30 + Math.round((tryNum / maxAttempts) * 55))
        emitTranscriptionProgress(sessionId, {
          status: 'processing',
          progress,
          attempt,
          maxAttempts,
          provider,
          message: `Transcribing (attempt ${tryNum}/${maxAttempts})`,
        })

        if (provider !== 'mock' && (!mergedPath || !existsSync(mergedPath))) {
          throw new Error('Merged recording file is missing')
        }

        return transcribeAudioFile({
          filePath: mergedPath,
          answers,
        })
      },
      {
        maxAttempts,
        baseDelayMs: env.transcription.retryBaseDelayMs,
        maxDelayMs: env.transcription.retryMaxDelayMs,
        label: `transcription:${sessionId}`,
        shouldRetry: (err) => {
          if (err.status === 400 || err.status === 401 || err.status === 403) return false
          return isTransientHttpError(err) || !err.status
        },
      }
    )

    const durationMs = Date.now() - started
    const text = (result.text ?? '').trim()

    await saveSessionTranscript(sessionId, {
      text,
      provider: result.provider,
      language: result.language,
      durationMs,
      status: 'done',
      error: null,
      attempts: attempt,
      segments: result.segments,
    })

    emitTranscriptionProgress(sessionId, {
      status: 'done',
      progress: 100,
      provider: result.provider,
      attempt,
      textLength: text.length,
    })

    log('info', 'Transcription complete', {
      sessionId,
      provider: result.provider,
      durationMs,
      textLength: text.length,
      attempts: attempt,
    })

    return { sessionId, transcript: text, provider: result.provider, durationMs }
  } catch (err) {
    const message = err?.message ?? 'Transcription failed'
    emitTranscriptionProgress(sessionId, {
      status: 'failed',
      progress: 0,
      error: message,
      attempt,
      provider,
    })
    await markTranscriptFailed(sessionId, { error: message, attempts: attempt })
    log('error', 'Transcription failed', { sessionId, error: message, attempts: attempt })
    throw err
  }
}
