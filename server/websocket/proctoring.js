import { WebSocketServer } from 'ws'
import { getSession, updateSession } from '../store/sessionStore.js'
import { log } from '../utils/logger.js'

const clients = new Map()
const lastFaceAlertBySession = new Map()
const FACE_ALERT_COOLDOWN_MS = 20000

function appendProctoringLog(existing, entry) {
  const logEntries = [...(existing ?? []), entry]
  return logEntries.length > 40 ? logEntries.slice(-40) : logEntries
}

export function attachProctoringWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws/proctoring' })

  wss.on('connection', async (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`)
    const sessionId = url.searchParams.get('sessionId')

    const session = sessionId ? await getSession(sessionId) : null
    if (!sessionId || !session) {
      ws.close(4001, 'Invalid session')
      return
    }

    if (!clients.has(sessionId)) clients.set(sessionId, new Set())
    clients.get(sessionId).add(ws)

    ws.isAlive = true
    ws.on('pong', () => { ws.isAlive = true })

    ws.send(JSON.stringify({ type: 'connected', sessionId, ts: Date.now() }))

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString())
        handleProctoringEvent(sessionId, msg, ws).catch((err) => {
          log('error', 'Proctoring handler error', { sessionId, error: err.message })
        })
      } catch {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }))
      }
    })

    ws.on('close', () => {
      clients.get(sessionId)?.delete(ws)
      log('debug', 'WebSocket disconnected', { sessionId })
    })

    log('info', 'WebSocket connected', { sessionId })
  })

  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) return ws.terminate()
      ws.isAlive = false
      ws.ping()
    })
  }, 30000)

  wss.on('close', () => clearInterval(interval))

  return wss
}

async function handleProctoringEvent(sessionId, msg, ws) {
  const session = await getSession(sessionId)
  if (!session) return

  const sd = session.session_data
  const at = new Date().toISOString()
  let patch = {}
  let event = msg.type

  switch (msg.type) {
    case 'tab_switch': {
      patch.tabWarnings = (sd.tabWarnings ?? 0) + 1
      patch.proctoringLog = appendProctoringLog(sd.proctoringLog, {
        type: 'tab_switch',
        at,
        message: 'Candidate switched away from the interview tab',
      })
      patch.flags = [
        ...(sd.flags ?? []),
        `tab_switch at ${at}`,
      ]
      log('info', 'Proctoring: tab switch', { sessionId, count: patch.tabWarnings })
      break
    }
    case 'face_absence': {
      const last = lastFaceAlertBySession.get(sessionId) ?? 0
      if (Date.now() - last < FACE_ALERT_COOLDOWN_MS) {
        ws.send(JSON.stringify({ type: 'face_absence_ignored', reason: 'cooldown' }))
        return
      }
      lastFaceAlertBySession.set(sessionId, Date.now())
      patch.faceAbsenceWarnings = (sd.faceAbsenceWarnings ?? 0) + 1
      patch.proctoringLog = appendProctoringLog(sd.proctoringLog, {
        type: 'face_absence',
        at,
        durationMs: msg.durationMs ?? null,
        message: 'Face not visible in camera feed',
      })
      patch.flags = [
        ...(sd.flags ?? []),
        `face_absence at ${at}`,
      ]
      log('info', 'Proctoring: face absence', { sessionId, count: patch.faceAbsenceWarnings })
      break
    }
    case 'camera_disconnect':
      patch.proctoringLog = appendProctoringLog(sd.proctoringLog, {
        type: 'camera_disconnect',
        at,
        message: 'Camera disconnected during interview',
      })
      patch.flags = [
        ...(sd.flags ?? []),
        `camera_disconnect at ${at}`,
      ]
      break
    case 'heartbeat':
      patch.lastHeartbeat = at
      ws.send(JSON.stringify({ type: 'heartbeat_ack', ts: Date.now() }))
      return
    case 'sync_state':
      patch = { ...patch, ...msg.state }
      event = 'sync_state'
      break
    default:
      return
  }

  const updated = await updateSession(sessionId, patch)

  broadcast(sessionId, {
    type: 'proctoring_update',
    event,
    session: updated.session_data,
    ts: Date.now(),
  })
}

export function broadcast(sessionId, payload) {
  const set = clients.get(sessionId)
  if (!set) return
  const data = JSON.stringify(payload)
  set.forEach((ws) => {
    if (ws.readyState === 1) ws.send(data)
  })
}
