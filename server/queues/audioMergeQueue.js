import { log, logProcessingTime } from '../utils/logger.js'
import { updateSession } from '../store/sessionStore.js'
import { getRecordingStorage } from '../services/storage/index.js'

const queue = []
let processing = false

export function enqueueMerge(sessionId, { force = false } = {}) {
  return new Promise((resolve, reject) => {
    queue.push({ sessionId, resolve, reject, force })
    processQueue()
  })
}

async function processQueue() {
  if (processing || queue.length === 0) return
  processing = true
  const job = queue.shift()
  const started = Date.now()

  try {
    log('info', 'SQS merge job started', { sessionId: job.sessionId, force: job.force })
    const result = await getRecordingStorage().mergeChunks(job.sessionId, { force: job.force })
    logProcessingTime('SQS.MergeQueue', Date.now() - started, {
      sessionId: job.sessionId,
      chunkCount: result.chunkCount,
    })
    job.resolve(result)
  } catch (err) {
    log('error', 'Audio merge failed', { sessionId: job.sessionId, error: err.message })
    await updateSession(job.sessionId, { mergeStatus: 'failed', mergeError: err.message })
    job.reject(err)
  } finally {
    processing = false
    processQueue()
  }
}
