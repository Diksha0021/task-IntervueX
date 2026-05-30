import { log } from '../utils/logger.js'
import { transcribeSessionRecording } from '../services/transcription/index.js'
import { env } from '../config/env.js'

const queue = []
let processing = false

export function enqueueTranscription(sessionId, options = {}) {
  return new Promise((resolve, reject) => {
    queue.push({ sessionId, options, resolve, reject })
    processQueue()
  })
}

async function processQueue() {
  if (processing || queue.length === 0) return
  processing = true
  const job = queue.shift()

  try {
    const result = await transcribeSessionRecording(job.sessionId, job.options)
    job.resolve(result)
  } catch (err) {
    job.reject(err)
  } finally {
    processing = false
    processQueue()
  }
}

/** Schedule a background retry after merge/transcription failure (non-blocking). */
export function scheduleTranscriptionRetry(sessionId, delayMs = env.transcription.retryBaseDelayMs) {
  log('info', 'Scheduling transcription retry', { sessionId, delayMs })
  setTimeout(() => {
    enqueueTranscription(sessionId, { attemptOffset: 0 }).catch((err) => {
      log('error', 'Scheduled transcription retry failed', {
        sessionId,
        error: err.message,
      })
    })
  }, delayMs)
}
