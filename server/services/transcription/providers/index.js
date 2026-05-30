import { env } from '../../../config/env.js'
import { transcribeWithWhisper } from './whisper.js'
import { transcribeWithDeepgram } from './deepgram.js'
import { transcribeWithMock } from './mock.js'

export function resolveTranscriptionProvider() {
  const configured = (env.transcription.provider ?? 'auto').toLowerCase()

  if (configured === 'whisper' && env.transcription.openaiApiKey) return 'whisper'
  if (configured === 'deepgram' && env.transcription.deepgramApiKey) return 'deepgram'
  if (configured === 'mock') return 'mock'

  if (configured === 'auto' || configured === 'whisper') {
    if (env.transcription.openaiApiKey) return 'whisper'
    if (env.transcription.deepgramApiKey) return 'deepgram'
  }

  return 'mock'
}

/**
 * Transcribe merged audio at filePath using the configured provider.
 */
export async function transcribeAudioFile({ filePath, answers = [] }) {
  const provider = resolveTranscriptionProvider()

  if (provider === 'whisper') {
    return transcribeWithWhisper(filePath)
  }
  if (provider === 'deepgram') {
    return transcribeWithDeepgram(filePath)
  }
  return transcribeWithMock({ answers })
}
