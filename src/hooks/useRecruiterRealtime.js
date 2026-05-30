import { useEffect, useRef, useState } from 'react'
import { RealtimeEvents } from '../lib/realtime/events.js'
import { connectRealtimeSocket, disconnectRealtimeSocket } from '../lib/realtime/socketClient.js'

/**
 * Recruiter dashboard listens on the shared `recruiters` room (server-side join).
 */
export function useRecruiterRealtime({ enabled = true, onEvent } = {}) {
  const [connected, setConnected] = useState(false)
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  useEffect(() => {
    if (!enabled) return undefined

    const socket = connectRealtimeSocket()
    const onConnect = () => setConnected(true)
    const onDisconnect = () => setConnected(false)
    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)

    const forward = (event) => (data) => {
      onEventRef.current?.(event, data)
    }

    const handlers = [
      [RealtimeEvents.CHUNK_UPLOADED, forward(RealtimeEvents.CHUNK_UPLOADED)],
      [RealtimeEvents.TRANSCRIPTION_PROGRESS, forward(RealtimeEvents.TRANSCRIPTION_PROGRESS)],
      [RealtimeEvents.INTERVIEW_COMPLETED, forward(RealtimeEvents.INTERVIEW_COMPLETED)],
      [RealtimeEvents.REPORT_GENERATED, forward(RealtimeEvents.REPORT_GENERATED)],
    ]

    handlers.forEach(([event, fn]) => socket.on(event, fn))
    if (!socket.connected) socket.connect()
    else onConnect()

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      handlers.forEach(([event, fn]) => socket.off(event, fn))
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      disconnectRealtimeSocket()
      setConnected(false)
    }
  }, [enabled])

  return { connected }
}
