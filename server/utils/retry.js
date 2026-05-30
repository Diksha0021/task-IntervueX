import { log } from './logger.js'

/**
 * Run an async function with exponential backoff retries.
 * @param {() => Promise<T>} fn
 * @param {{ maxAttempts?: number, baseDelayMs?: number, maxDelayMs?: number, label?: string, shouldRetry?: (err: Error) => boolean }} options
 * @returns {Promise<T>}
 */
export async function withRetry(fn, options = {}) {
  const {
    maxAttempts = 3,
    baseDelayMs = 1000,
    maxDelayMs = 8000,
    label = 'operation',
    shouldRetry = () => true,
  } = options

  let lastError

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      const retryable = attempt < maxAttempts && shouldRetry(lastError)

      log('warn', `${label} failed`, {
        attempt,
        maxAttempts,
        error: lastError.message,
        willRetry: retryable,
      })

      if (!retryable) break

      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastError
}

/** HTTP 429 / 5xx and network errors are worth retrying. */
export function isTransientHttpError(err) {
  const msg = err?.message ?? ''
  if (/ECONNRESET|ETIMEDOUT|fetch failed|network/i.test(msg)) return true
  const status = err?.status ?? err?.statusCode
  if (status === 429) return true
  if (typeof status === 'number' && status >= 500) return true
  return false
}
