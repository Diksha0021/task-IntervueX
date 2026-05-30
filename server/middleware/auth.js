import { verifyToken } from '../utils/jwt.js'
import { findById, sanitize } from '../store/userStore.js'

export function requireAuth(req, res, next) {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' })
  }

  const payload = verifyToken(token)
  if (!payload?.userId) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  const user = sanitize(findById(payload.userId))
  if (!user) {
    return res.status(401).json({ error: 'User not found' })
  }

  req.user = user
  next()
}

export function requireRole(role) {
  return (req, res, next) => {
    if (req.user?.role !== role) {
      return res.status(403).json({ error: 'Access denied for this role' })
    }
    next()
  }
}
