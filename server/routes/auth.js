import { Router } from 'express'
import { createUser, findByEmail, sanitize } from '../store/userStore.js'
import { verifyPassword } from '../utils/password.js'
import { signToken } from '../utils/jwt.js'
import { requireAuth } from '../middleware/auth.js'
import { log } from '../utils/logger.js'

const router = Router()

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validateEmail(email) {
  return typeof email === 'string' && EMAIL_RE.test(email.trim())
}

function validatePassword(password) {
  return typeof password === 'string' && password.length >= 6
}

router.post('/signup', async (req, res) => {
  try {
    const { email, password, role, name } = req.body ?? {}

    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Valid email is required' })
    }
    if (!validatePassword(password)) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' })
    }
    if (!['candidate', 'recruiter'].includes(role)) {
      return res.status(400).json({ error: 'Role must be candidate or recruiter' })
    }

    const user = await createUser({ email, password, role, name })
    const token = signToken({ userId: user.id, role: user.role })

    log('info', 'User signed up', { email: user.email, role: user.role })
    res.status(201).json({ user, token })
  } catch (err) {
    if (err.code === 'EMAIL_EXISTS') {
      return res.status(409).json({ error: 'An account with this email already exists' })
    }
    log('error', 'Signup failed', { error: err.message })
    res.status(500).json({ error: 'Signup failed' })
  }
})

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body ?? {}

    if (!validateEmail(email) || !validatePassword(password)) {
      return res.status(400).json({ error: 'Invalid email or password' })
    }

    const record = findByEmail(email)
    if (!record) {
      return res.status(401).json({
        error: 'No account found for this email. Please sign up first.',
      })
    }

    const valid = await verifyPassword(password, record.passwordHash)
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    const user = sanitize(record)
    const token = signToken({ userId: user.id, role: user.role })

    log('info', 'User logged in', { email: user.email, role: user.role })
    res.json({ user, token })
  } catch (err) {
    log('error', 'Login failed', { error: err.message })
    res.status(500).json({ error: 'Login failed' })
  }
})

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user })
})

export default router
