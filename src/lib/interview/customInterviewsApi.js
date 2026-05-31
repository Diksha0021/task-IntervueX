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

export async function fetchRecruiterInterviews() {
  const data = await request('/api/interviews')
  return data.interviews ?? []
}

export async function fetchInterviewTopics() {
  const data = await request('/api/interviews/topics')
  return data.topics ?? []
}

export async function createRecruiterInterview(payload) {
  const data = await request('/api/interviews', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return data.interview
}

export async function deleteRecruiterInterview(id) {
  return request(`/api/interviews/${id}`, { method: 'DELETE' })
}

export async function fetchInterviewByInvite(inviteCode) {
  const res = await fetch(`${API_BASE}/api/interviews/join/${encodeURIComponent(inviteCode)}`)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? 'Invalid invite link')
  return data
}

export async function fetchInterviewProfileForCandidate(inviteCode) {
  const data = await request(`/api/interviews/join/${encodeURIComponent(inviteCode)}/full`)
  return data
}

const INVITE_STORAGE_KEY = 'intervuex_pending_invite'

export function savePendingInvite(code) {
  if (code) localStorage.setItem(INVITE_STORAGE_KEY, code.trim().toUpperCase())
}

export function loadPendingInvite() {
  return localStorage.getItem(INVITE_STORAGE_KEY) ?? null
}

export function clearPendingInvite() {
  localStorage.removeItem(INVITE_STORAGE_KEY)
}

export function profileFromCustomInterview(interview) {
  if (!interview) return null
  return {
    id: interview.id,
    customInterviewId: interview.id,
    isCustom: true,
    title: interview.title,
    roleLabel: interview.roleLabel ?? interview.title,
    durationMinutes: interview.durationMinutes ?? 25,
    keywords: interview.keywords ?? [],
    topics: interview.topics ?? [],
    questions: (interview.questions ?? []).map((q) =>
      typeof q === 'string' ? { type: 'technical', text: q } : q
    ),
    inviteCode: interview.inviteCode,
    recruiterId: interview.recruiterId,
  }
}

export function getQuestionTextsFromProfile(profile) {
  return (profile?.questions ?? []).map((q) => (typeof q === 'string' ? q : q.text))
}
