const SESSION_KEY = 'intervuex_interview_session'
const LEGACY_SESSION_KEY = 'novahire_interview_session'
const PROGRESS_KEY = 'intervuex_interview_progress'
const ACTIVE_ROUTE_KEY = 'intervuex_active_interview_route'

export function saveLocalSession(session) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    localStorage.removeItem(LEGACY_SESSION_KEY)
  } catch {
    /* quota exceeded */
  }
}

export function loadLocalSession() {
  try {
    const raw =
      localStorage.getItem(SESSION_KEY) ?? localStorage.getItem(LEGACY_SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function clearLocalSession() {
  localStorage.removeItem(SESSION_KEY)
  localStorage.removeItem(LEGACY_SESSION_KEY)
}

export function saveInterviewProgress(progress) {
  try {
    localStorage.setItem(
      PROGRESS_KEY,
      JSON.stringify({ ...progress, updatedAt: progress.updatedAt ?? Date.now() })
    )
  } catch {
    /* quota */
  }
}

export function loadInterviewProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function clearInterviewProgress() {
  localStorage.removeItem(PROGRESS_KEY)
}

export function saveActiveRoute(route) {
  try {
    localStorage.setItem(ACTIVE_ROUTE_KEY, JSON.stringify(route))
  } catch {
    /* quota */
  }
}

export function loadActiveRoute() {
  try {
    const raw = localStorage.getItem(ACTIVE_ROUTE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function clearActiveRoute() {
  localStorage.removeItem(ACTIVE_ROUTE_KEY)
}

export function getResumeSessionId() {
  const progress = loadInterviewProgress()
  const s = loadLocalSession()
  const id = s?.id ?? progress?.sessionId
  if (!id) return null

  const status = s?.session_data?.status ?? progress?.status
  if (status === 'completed') return null
  return id
}

export function clearAllInterviewRecovery() {
  clearLocalSession()
  clearInterviewProgress()
  clearActiveRoute()
}
