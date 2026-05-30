const API_BASE = import.meta.env.VITE_API_URL ?? ''
const BUFFER_MAX = 50
const buffer = []

/**
 * Structured client-side failure logging with optional server forwarding.
 */
export function logFailure(category, message, meta = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level: 'error',
    category,
    message,
    ...meta,
    url: typeof window !== 'undefined' ? window.location.pathname : undefined,
  }

  buffer.push(entry)
  if (buffer.length > BUFFER_MAX) buffer.shift()

  const line = `[IntervueX:${category}] ${message}`
  if (meta?.severity === 'warn') {
    console.warn(line, meta)
  } else {
    console.error(line, meta)
  }

  flushToServer(entry).catch(() => {})
  return entry
}

export function logWarning(category, message, meta = {}) {
  return logFailure(category, message, { ...meta, severity: 'warn' })
}

export function getFailureBuffer() {
  return [...buffer]
}

async function flushToServer(entry) {
  if (!navigator.onLine) return

  let token = null
  try {
    const { getToken } = await import('../auth/api.js')
    token = getToken()
  } catch {
    /* ignore */
  }

  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`

  await fetch(`${API_BASE}/api/logs/client`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ logs: [entry] }),
    keepalive: true,
  })
}
