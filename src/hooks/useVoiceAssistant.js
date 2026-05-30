import { useState, useRef, useCallback, useEffect } from 'react'
import { logFailure } from '../lib/failure/failureLogger.js'
import { getUserMessage } from '../lib/failure/userMessages.js'

const SPEECH_RECOGNITION_CLASS =
  typeof window !== 'undefined'
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null

function waitForSpeechSynthesisIdle(maxMs = 15000) {
  return new Promise((resolve) => {
    if (!window.speechSynthesis) {
      resolve()
      return
    }
    const start = Date.now()
    const tick = () => {
      if (!window.speechSynthesis.speaking) {
        resolve()
        return
      }
      if (Date.now() - start > maxMs) {
        resolve()
        return
      }
      setTimeout(tick, 50)
    }
    tick()
  })
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Browser speech recognition + TTS for the interview agent.
 * Uses cumulative result indexing (append only new final segments) for reliable capture.
 */
export function useVoiceAssistant() {
  const [state, setState] = useState('idle')
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [recognitionError, setRecognitionError] = useState(null)
  const [supported, setSupported] = useState({
    speech: true,
    recognition: !!SPEECH_RECOGNITION_CLASS,
  })

  const recognitionRef = useRef(null)
  const listeningRef = useRef(false)
  const finalBufferRef = useRef('')
  const restartTimerRef = useRef(null)

  const getVoice = useCallback(() => {
    if (!window.speechSynthesis) return null
    const voices = window.speechSynthesis.getVoices()
    return (
      voices.find(
        (v) => v.lang.startsWith('en') && /google|natural|samantha|zira|aria|jenny/i.test(v.name)
      ) ||
      voices.find((v) => v.lang.startsWith('en')) ||
      null
    )
  }, [])

  const cancelSpeech = useCallback(() => {
    try {
      window.speechSynthesis?.cancel()
    } catch {
      /* ignore */
    }
  }, [])

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current)
      restartTimerRef.current = null
    }
  }, [])

  const stopListening = useCallback(() => {
    listeningRef.current = false
    clearRestartTimer()
    const rec = recognitionRef.current
    recognitionRef.current = null
    if (!rec) return
    try {
      rec.onstart = null
      rec.onresult = null
      rec.onerror = null
      rec.onend = null
      rec.abort()
    } catch {
      try {
        rec.stop()
      } catch {
        /* ignore */
      }
    }
  }, [clearRestartTimer])

  const speak = useCallback(
    async (text) => {
      if (!window.speechSynthesis) {
        setSupported((s) => ({ ...s, speech: false }))
        return
      }
      cancelSpeech()
      stopListening()
      setState('speaking')
      setRecognitionError(null)

      await waitForSpeechSynthesisIdle()

      return new Promise((resolve) => {
        let settled = false
        const finish = () => {
          if (settled) return
          settled = true
          setState('idle')
          resolve()
        }

        const utterance = new SpeechSynthesisUtterance(text)
        utterance.rate = 0.9
        utterance.pitch = 1
        utterance.volume = 1
        const voice = getVoice()
        if (voice) utterance.voice = voice

        const safetyMs = Math.min(120000, Math.max(5000, text.length * 85))
        const safetyTimer = setTimeout(finish, safetyMs)
        const wrappedFinish = () => {
          clearTimeout(safetyTimer)
          finish()
        }
        utterance.onend = wrappedFinish
        utterance.onerror = wrappedFinish
        window.speechSynthesis.speak(utterance)
      })
    },
    [cancelSpeech, stopListening, getVoice]
  )

  const scheduleRecognitionRestart = useCallback((recognition, delayMs = 300) => {
    clearRestartTimer()
    restartTimerRef.current = setTimeout(() => {
      if (!listeningRef.current || recognitionRef.current !== recognition) return
      try {
        recognition.start()
      } catch {
        listeningRef.current = false
        setState('idle')
      }
    }, delayMs)
  }, [clearRestartTimer])

  const startListening = useCallback(() => {
    if (!SPEECH_RECOGNITION_CLASS) {
      setSupported((s) => ({ ...s, recognition: false }))
      setRecognitionError('Speech recognition is not supported. Use Chrome or Edge.')
      return false
    }

    cancelSpeech()
    stopListening()
    setRecognitionError(null)

    const recognition = new SPEECH_RECOGNITION_CLASS()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      listeningRef.current = true
      setState('listening')
      setRecognitionError(null)
    }

    recognition.onresult = (event) => {
      try {
        let interim = ''

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]
          const text = (result[0]?.transcript ?? '').trim()
          if (!text) continue

          if (result.isFinal) {
            finalBufferRef.current += `${text} `
          } else {
            interim += `${text} `
          }
        }

        setTranscript(finalBufferRef.current.trim())
        setInterimTranscript(interim.trim())
      } catch {
        /* ignore parse errors */
      }
    }

    recognition.onerror = (event) => {
      if (event.error === 'aborted') return

      if (event.error === 'no-speech') {
        scheduleRecognitionRestart(recognition, 200)
        return
      }

      if (event.error === 'network') {
        const msg = getUserMessage('speech_network')
        logFailure('speech', msg, { error: event.error, severity: 'warn' })
        setRecognitionError(msg)
        scheduleRecognitionRestart(recognition, 800)
        return
      }

      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        listeningRef.current = false
        setState('idle')
        const msg = getUserMessage('speech_not_allowed')
        logFailure('speech', msg, { error: event.error })
        setRecognitionError(msg)
        return
      }

      if (event.error === 'audio-capture') {
        const msg = getUserMessage('camera_in_use')
        logFailure('speech', msg, { error: event.error, severity: 'warn' })
        setRecognitionError(msg)
        scheduleRecognitionRestart(recognition, 1000)
        return
      }

      listeningRef.current = false
      setState('idle')
      const msg = getUserMessage('speech_unavailable')
      logFailure('speech', msg, { error: event.error, severity: 'warn' })
      setRecognitionError(msg)
    }

    recognition.onend = () => {
      if (!listeningRef.current || recognitionRef.current !== recognition) return
      scheduleRecognitionRestart(recognition, 350)
    }

    recognitionRef.current = recognition
    listeningRef.current = true

    try {
      recognition.start()
      return true
    } catch (err) {
      listeningRef.current = false
      recognitionRef.current = null
      setState('idle')
      setRecognitionError(err?.message ?? 'Could not start microphone')
      return false
    }
  }, [cancelSpeech, stopListening, scheduleRecognitionRestart])

  const listenAfterSpeech = useCallback(async () => {
    await waitForSpeechSynthesisIdle()
    await delay(700)

    let ok = startListening()
    if (!ok) {
      await delay(800)
      ok = startListening()
    }
    return ok
  }, [startListening])

  const resetTranscript = useCallback(() => {
    finalBufferRef.current = ''
    setTranscript('')
    setInterimTranscript('')
    setRecognitionError(null)
  }, [])

  const setTranscriptFromRestore = useCallback((text) => {
    const value = `${text ?? ''}`.trim()
    finalBufferRef.current = value ? `${value} ` : ''
    setTranscript(value)
    setInterimTranscript('')
  }, [])

  const cleanup = useCallback(() => {
    listeningRef.current = false
    clearRestartTimer()
    try {
      cancelSpeech()
      stopListening()
    } catch {
      /* ignore */
    }
  }, [cancelSpeech, stopListening, clearRestartTimer])

  useEffect(() => {
    setSupported({
      speech: !!window.speechSynthesis,
      recognition: !!SPEECH_RECOGNITION_CLASS,
    })
    if (!window.speechSynthesis) return undefined
    const loadVoices = () => window.speechSynthesis.getVoices()
    loadVoices()
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices)
    return () => {
      window.speechSynthesis?.removeEventListener('voiceschanged', loadVoices)
      cleanup()
    }
  }, [cleanup])

  const getFullTranscript = useCallback(
    () => `${transcript}${interimTranscript ? ` ${interimTranscript}` : ''}`.trim(),
    [transcript, interimTranscript]
  )

  return {
    state,
    transcript,
    interimTranscript,
    recognitionError,
    supported,
    speak,
    startListening,
    listenAfterSpeech,
    stopListening,
    resetTranscript,
    setTranscriptFromRestore,
    cancelSpeech,
    cleanup,
    getFullTranscript,
  }
}
