import { io } from 'socket.io-client'
import { getToken } from '../auth/api.js'

let socket = null

export function getRealtimeSocket() {
  if (!socket) {
    socket = io({
      path: '/socket.io',
      autoConnect: false,
      transports: ['websocket', 'polling'],
    })
  }
  return socket
}

export function connectRealtimeSocket() {
  const token = getToken()
  const s = getRealtimeSocket()
  if (!token) return s
  s.auth = { token }
  if (!s.connected) s.connect()
  return s
}

export function disconnectRealtimeSocket() {
  if (socket?.connected) socket.disconnect()
}

export function joinSessionRoom(sessionId) {
  if (!sessionId) return
  const s = connectRealtimeSocket()
  s.emit('join_session', { sessionId })
}

export function leaveSessionRoom(sessionId) {
  if (!sessionId || !socket) return
  socket.emit('leave_session', { sessionId })
}
