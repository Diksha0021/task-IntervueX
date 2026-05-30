import { getToken } from '../auth/api.js'
import { uploadChunkStream } from './chunkUpload.js'

const API_BASE = import.meta.env.VITE_API_URL ?? ''

async function request(path, options = {}) {
  const token = getToken()
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers ?? {}),
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${API_BASE}${path}`, {
    headers,
    ...options,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error ?? 'Request failed')
  }

  return res.json()
}

export async function createSession({ hardwareCheck, resumeFrom, interviewProfile } = {}) {
  const body = {
    hardwareCheck,
    resumeFrom,
  }
  if (interviewProfile) {
    body.interviewProfileId = interviewProfile.id
    body.interviewTitle = interviewProfile.title
    body.durationMinutes = interviewProfile.durationMinutes
    body.interviewKeywords = interviewProfile.keywords ?? []
    body.questions = interviewProfile.questions.map((q) => q.text)
  }
  return request('/api/sessions', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function getSession(sessionId) {
  return request(`/api/sessions/${sessionId}`)
}

export async function patchSession(sessionId, data) {
  return request(`/api/sessions/${sessionId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function completeSession(sessionId, sessionData, { retries = 3 } = {}) {
  const body = JSON.stringify({ session_data: sessionData })
  const token = getToken()
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`

  let lastError = null
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${API_BASE}/api/sessions/${sessionId}/complete`, {
        method: 'POST',
        headers,
        body,
        keepalive: body.length < 60000,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(err.error ?? 'Request failed')
      }

      return res.json()
    } catch (err) {
      lastError = err
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 800 * attempt))
      }
    }
  }

  throw lastError ?? new Error('Could not submit interview')
}

export async function uploadChunk(sessionId, chunkIndex, blob, timestamp = Date.now(), retries = 4) {
  return uploadChunkStream({ sessionId, chunkIndex, blob, timestamp }, retries)
}

export async function checkApiHealth() {
  try {
    const base = import.meta.env.VITE_API_URL ?? ''
    const url = base ? `${base.replace(/\/$/, '')}/health` : '/health'
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) })
    return res.ok
  } catch {
    return false
  }
}
