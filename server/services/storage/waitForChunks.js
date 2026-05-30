import { log, logProcessingTime } from '../../utils/logger.js'

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Poll until enough chunks exist on the server before merging.
 * Prevents incomplete recordings when the client is still uploading.
 */
export async function waitForUploadedChunks(
  sessionId,
  expectedCount,
  listKeysFn,
  { timeoutMs = 120000, pollMs = 1500, minWaitMs = 2000 } = {}
) {
  const started = Date.now()
  const target = Math.max(1, Number(expectedCount) || 0)

  if (target <= 0) {
    return listKeysFn(sessionId)
  }

  await sleep(minWaitMs)

  while (Date.now() - started < timeoutMs) {
    const keys = await listKeysFn(sessionId)
    const elapsed = Date.now() - started

    log('info', 'Waiting for interview chunks before merge', {
      sessionId,
      have: keys.length,
      expected: target,
      elapsedMs: elapsed,
    })

    if (keys.length >= target) {
      logProcessingTime('SQS.ChunkUploadWait', elapsed, {
        sessionId,
        chunkCount: keys.length,
        expected: target,
      })
      return keys
    }

    await sleep(pollMs)
  }

  const keys = await listKeysFn(sessionId)
  log('warn', 'Chunk wait timed out — merging available chunks', {
    sessionId,
    have: keys.length,
    expected: target,
    timeoutMs,
  })
  return keys
}
