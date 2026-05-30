const WS_BASE =
  import.meta.env.VITE_WS_URL ??
  (typeof location !== 'undefined'
    ? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`
    : 'ws://localhost:3001')

export function createProctoringSocket(sessionId, handlers = {}) {
  let ws = null
  let reconnectTimer = null
  let closedByUser = false
  let reconnectAttempt = 0
  const maxReconnectDelay = 10000

  function connect() {
    const url = `${WS_BASE}/ws/proctoring?sessionId=${sessionId}`
    ws = new WebSocket(url)

    ws.onopen = () => {
      reconnectAttempt = 0
      handlers.onConnect?.()
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        handlers.onMessage?.(msg)
      } catch {
        /* ignore */
      }
    }

    ws.onclose = () => {
      handlers.onDisconnect?.()
      if (!closedByUser) scheduleReconnect()
    }

    ws.onerror = () => {
      handlers.onError?.()
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer) return
    const delay = Math.min(1000 * 2 ** reconnectAttempt, maxReconnectDelay)
    reconnectAttempt++
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect()
    }, delay)
  }

  function send(payload) {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload))
      return true
    }
    return false
  }

  function isConnected() {
    return ws?.readyState === WebSocket.OPEN
  }

  function startHeartbeat(intervalMs = 15000) {
    const id = setInterval(() => send({ type: 'heartbeat' }), intervalMs)
    return () => clearInterval(id)
  }

  function close() {
    closedByUser = true
    if (reconnectTimer) clearTimeout(reconnectTimer)
    ws?.close()
  }

  connect()

  return { send, close, startHeartbeat, isConnected }
}
