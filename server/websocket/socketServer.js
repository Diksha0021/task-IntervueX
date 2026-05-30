import { Server } from 'socket.io'
import { verifyToken } from '../utils/jwt.js'
import { findById, sanitize } from '../store/userStore.js'
import { log } from '../utils/logger.js'

let io = null

export function getIO() {
  return io
}

export function attachSocketIO(httpServer) {
  io = new Server(httpServer, {
    path: '/socket.io',
    cors: {
      origin: true,
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  })

  io.use((socket, next) => {
    const token =
      socket.handshake.auth?.token ??
      socket.handshake.query?.token ??
      null

    if (!token || typeof token !== 'string') {
      return next(new Error('Authentication required'))
    }

    const payload = verifyToken(token)
    if (!payload?.userId) {
      return next(new Error('Invalid or expired token'))
    }

    const user = sanitize(findById(payload.userId))
    if (!user) {
      return next(new Error('User not found'))
    }

    socket.user = user
    socket.userId = user.id
    socket.userRole = user.role
    next()
  })

  io.on('connection', (socket) => {
    log('debug', 'Socket.IO connected', {
      userId: socket.userId,
      role: socket.userRole,
    })

    if (socket.userRole === 'recruiter') {
      socket.join('recruiters')
    }

    socket.on('join_session', ({ sessionId } = {}) => {
      if (!sessionId || typeof sessionId !== 'string') return
      socket.join(`session:${sessionId}`)
      log('debug', 'Socket joined session room', {
        sessionId,
        userId: socket.userId,
      })
    })

    socket.on('leave_session', ({ sessionId } = {}) => {
      if (!sessionId) return
      socket.leave(`session:${sessionId}`)
    })

    socket.on('disconnect', (reason) => {
      log('debug', 'Socket.IO disconnected', {
        userId: socket.userId,
        reason,
      })
    })
  })

  return io
}
