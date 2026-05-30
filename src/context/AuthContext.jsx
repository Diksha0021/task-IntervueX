import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import * as authApi from '../lib/auth/api.js'

const AuthContext = createContext(null)

const BOOTSTRAP_TIMEOUT_MS = 2500

/** API may return { user } or a bare user object — always normalize. */
function normalizeUser(value) {
  if (!value) return null
  if (value.user && typeof value.user === 'object') return value.user
  if (value.email && value.role) return value
  return null
}

export function AuthProvider({ children }) {
  const hasTokenOnMount = typeof window !== 'undefined' && !!authApi.getToken()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(hasTokenOnMount)
  const [authReady, setAuthReady] = useState(!hasTokenOnMount)

  useEffect(() => {
    let cancelled = false

    const completeBootstrap = () => {
      setLoading(false)
      setAuthReady(true)
    }

    const timeoutId = setTimeout(() => {
      if (!cancelled) completeBootstrap()
    }, BOOTSTRAP_TIMEOUT_MS)

    const done = () => {
      clearTimeout(timeoutId)
      if (!cancelled) completeBootstrap()
    }

    if (!authApi.getToken()) {
      done()
      return () => {
        cancelled = true
        clearTimeout(timeoutId)
      }
    }

    authApi
      .getMe()
      .then((data) => {
        if (!cancelled) setUser(normalizeUser(data))
      })
      .catch(() => {
        authApi.logout()
        if (!cancelled) setUser(null)
      })
      .finally(done)

    return () => {
      cancelled = true
      clearTimeout(timeoutId)
    }
  }, [])

  const login = useCallback(async (email, password) => {
    const u = await authApi.login({ email, password })
    setUser(normalizeUser(u))
    setLoading(false)
    setAuthReady(true)
    return normalizeUser(u)
  }, [])

  const signup = useCallback(async ({ email, password, role, name }) => {
    const u = await authApi.signup({ email, password, role, name })
    setUser(normalizeUser(u))
    setLoading(false)
    setAuthReady(true)
    return normalizeUser(u)
  }, [])

  const logout = useCallback(() => {
    authApi.logout()
    setUser(null)
    setLoading(false)
    setAuthReady(true)
  }, [])

  const isRecruiter = user?.role === 'recruiter'
  const isCandidate = user?.role === 'candidate'

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        authReady,
        login,
        signup,
        logout,
        isRecruiter,
        isCandidate,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
