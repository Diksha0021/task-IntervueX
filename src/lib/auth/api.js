const TOKEN_KEY = 'intervuex_auth_token'
const LEGACY_TOKEN_KEY = 'novahire_auth_token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) ?? localStorage.getItem(LEGACY_TOKEN_KEY)
}

export function setToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.removeItem(LEGACY_TOKEN_KEY)
  } else {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(LEGACY_TOKEN_KEY)
  }
}

const AUTH_TIMEOUT_MS = 5000

async function authRequest(path, options = {}) {
  const token = getToken()
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers ?? {}),
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS)

  let res
  try {
    res = await fetch(`/api/auth${path}`, {
      ...options,
      headers,
      signal: options.signal ?? controller.signal,
    })
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error('Auth server did not respond — start the API with npm run dev:server')
    }
    throw new Error('Cannot reach auth server — check that the dev server is running')
  } finally {
    clearTimeout(timeoutId)
  }

  const data = await res.json().catch(() => ({}))

  if (res.status === 502 || res.status === 503) {
    throw new Error(
      data.error ??
        'API server is offline. In the Ai-interview folder run: npm run dev:server (or npm run dev:all)'
    )
  }

  if (!res.ok) {
    throw new Error(data.error ?? `Request failed (${res.status})`)
  }

  return data
}

export async function signup({ email, password, role, name }) {
  const data = await authRequest('/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password, role, name }),
  })
  setToken(data.token)
  return data.user
}

export async function login({ email, password }) {
  const data = await authRequest('/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  setToken(data.token)
  return data.user
}

export async function fetchMe() {
  const data = await authRequest('/me')
  return data.user ?? null
}

export const getMe = fetchMe

export function logout() {
  setToken(null)
}
