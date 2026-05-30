import { useEffect, useRef, useState, useCallback } from 'react'
import { RealtimeEvents } from '../lib/realtime/events.js'
import {
  connectRealtimeSocket,
  disconnectRealtimeSocket,
  joinSessionRoom,
  leaveSessionRoom,
} from '../lib/realtime/socketClient.js'

/**
 * Subscribe to Socket.IO session events for the active interview.
 */
export function useRealtimeSocket({
  sessionId,
  enabled = true,
  onChunkUploaded,
  onTranscriptionProgress,
  onInterviewCompleted,
  onReportGenerated,
} = {}) {
  const [connected, setConnected] = useState(false)
  const handlersRef = useRef({
    onChunkUploaded,
    onTranscriptionProgress,
    onInterviewCompleted,
    onReportGenerated,
  })

  handlersRef.current = {
    onChunkUploaded,
    onTranscriptionProgress,
    onInterviewCompleted,
    onReportGenerated,
  }

  useEffect(() => {
    if (!enabled || !sessionId) return undefined

    const socket = connectRealtimeSocket()

    const onConnect = () => {
      setConnected(true)
      joinSessionRoom(sessionId)
    }
    const onDisconnect = () => setConnected(false)

    const chunkHandler = (data) => handlersRef.current.onChunkUploaded?.(data)
    const txHandler = (data) => handlersRef.current.onTranscriptionProgress?.(data)
    const completeHandler = (data) => handlersRef.current.onInterviewCompleted?.(data)
    const reportHandler = (data) => handlersRef.current.onReportGenerated?.(data)

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on(RealtimeEvents.CHUNK_UPLOADED, chunkHandler)
    socket.on(RealtimeEvents.TRANSCRIPTION_PROGRESS, txHandler)
    socket.on(RealtimeEvents.INTERVIEW_COMPLETED, completeHandler)
    socket.on(RealtimeEvents.REPORT_GENERATED, reportHandler)

    if (socket.connected) onConnect()
    else socket.connect()

    return () => {
      leaveSessionRoom(sessionId)
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off(RealtimeEvents.CHUNK_UPLOADED, chunkHandler)
      socket.off(RealtimeEvents.TRANSCRIPTION_PROGRESS, txHandler)
      socket.off(RealtimeEvents.INTERVIEW_COMPLETED, completeHandler)
      socket.off(RealtimeEvents.REPORT_GENERATED, reportHandler)
    }
  }, [enabled, sessionId])

  const disconnect = useCallback(() => {
    disconnectRealtimeSocket()
    setConnected(false)
  }, [])

  return { connected, disconnect }
}
