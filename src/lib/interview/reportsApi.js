import { getToken } from '../auth/api.js'

const API_BASE = import.meta.env.VITE_API_URL ?? ''

async function request(path, options = {}) {
  const token = getToken()
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers ?? {}),
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })
  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    throw new Error(data.error ?? 'Request failed')
  }

  return data
}

export async function fetchRecruiterCandidates() {
  const data = await request('/api/reports')
  return data.candidates ?? []
}

export async function updateRecruiterDecision(sessionId, decision) {
  return request(`/api/reports/${sessionId}/decision`, {
    method: 'PATCH',
    body: JSON.stringify({ decision }),
  })
}

export async function removeRecruiterCandidate(sessionId) {
  return request(`/api/reports/${sessionId}`, { method: 'DELETE' })
}
