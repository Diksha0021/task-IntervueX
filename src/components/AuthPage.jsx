import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { BrandLogo } from './BrandLogo.jsx'
import { checkApiHealth } from '../lib/interview/api.js'

export function AuthPage({ onSuccess }) {
  const { login, signup } = useAuth()
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('candidate')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [apiOnline, setApiOnline] = useState(null)

  useEffect(() => {
    let cancelled = false
    const probe = async () => {
      const ok = await checkApiHealth()
      if (!cancelled) setApiOnline(ok)
    }
    probe()
    const id = setInterval(probe, 8000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      let user
      if (mode === 'login') {
        user = await login(email.trim(), password)
      } else {
        user = await signup({
          email: email.trim(),
          password,
          role,
          name: name.trim() || undefined,
        })
      }
      onSuccess?.(user)
    } catch (err) {
      const msg = err.message ?? 'Something went wrong'
      if (mode === 'login' && msg.toLowerCase().includes('invalid email')) {
        setError('No account for this email. Use Sign Up to create one first (password: 6+ characters).')
      } else {
        setError(msg)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-cyan-950 text-white flex items-center justify-center p-6 relative overflow-hidden"
      style={{ minHeight: '100vh', background: '#04070f', color: '#e2e8f8' }}
    >
      <div className="absolute inset-0 grid-bg opacity-30" />
      <div className="glow-orb w-96 h-96 bg-cyan-500 -top-48 -left-48 opacity-20" />
      <div className="glow-orb w-80 h-80 bg-emerald-500 bottom-0 -right-32 opacity-20" />

      <div className="relative z-10 w-full max-w-md animate-slide-up">
        <BrandLogo
          layout="stack"
          size="lg"
          className="mb-8"
          subtitle={
            mode === 'login'
              ? 'Sign in with an existing account'
              : 'Register with any email — then use Login next time'
          }
        />

        <div className="glass-card rounded-3xl p-8">
          {apiOnline === false && (
            <div className="mb-4 text-sm text-amber-200 bg-amber-500/10 border border-amber-400/30 rounded-xl px-4 py-3 leading-relaxed">
              API server is offline. Open a terminal in the <strong>Ai-interview</strong> folder and run{' '}
              <code className="text-cyan-300">npm run dev:all</code> (or{' '}
              <code className="text-cyan-300">npm run dev:server</code> in one terminal, then{' '}
              <code className="text-cyan-300">npm run dev</code> in another).
            </div>
          )}

          <div className="flex rounded-xl bg-white/5 p-1 mb-6">
            <button
              type="button"
              onClick={() => { setMode('login'); setError('') }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
                mode === 'login' ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => { setMode('signup'); setError('') }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
                mode === 'signup' ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              Sign Up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Full name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Doe"
                  className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/10 focus:border-cyan-400/50 focus:outline-none transition-colors"
                />
              </div>
            )}

            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
                className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/10 focus:border-cyan-400/50 focus:outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/10 focus:border-cyan-400/50 focus:outline-none transition-colors"
              />
            </div>

            {mode === 'signup' && (
              <div>
                <label className="block text-sm text-gray-400 mb-2">I am a</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setRole('candidate')}
                    className={`py-3 px-4 rounded-xl border text-sm font-medium transition-all ${
                      role === 'candidate'
                        ? 'border-cyan-400/50 bg-cyan-500/10 text-cyan-300'
                        : 'border-white/10 hover:bg-white/5'
                    }`}
                  >
                    Candidate
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole('recruiter')}
                    className={`py-3 px-4 rounded-xl border text-sm font-medium transition-all ${
                      role === 'recruiter'
                        ? 'border-emerald-400/50 bg-emerald-500/10 text-emerald-300'
                        : 'border-white/10 hover:bg-white/5'
                    }`}
                  >
                    Recruiter
                  </button>
                </div>
              </div>
            )}

            {error && (
              <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-xl px-4 py-2">
                {error}
              </p>
            )}

            <button type="submit" disabled={submitting || apiOnline === false} className="w-full btn-primary py-4 disabled:opacity-50">
              {submitting ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <p className="text-xs text-gray-500 mt-4 text-center leading-relaxed">
            Demo recruiter: recruiter@demo.com · password: demo1234
          </p>
        </div>
      </div>
    </div>
  )
}
