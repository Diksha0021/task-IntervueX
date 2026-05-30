import { readFileSync } from 'fs'
import { env } from '../../../config/env.js'

/**
 * OpenAI Whisper API (or compatible endpoint) transcription.
 */
export async function transcribeWithWhisper(filePath) {
  const apiKey = env.transcription.openaiApiKey
  if (!apiKey) {
    const err = new Error('OPENAI_API_KEY is not configured')
    err.status = 400
    throw err
  }

  const buffer = readFileSync(filePath)
  const form = new FormData()
  form.append('file', new Blob([buffer], { type: 'audio/webm' }), 'merged.webm')
  form.append('model', env.transcription.whisperModel)
  form.append('response_format', 'verbose_json')

  const baseUrl = env.transcription.openaiBaseUrl.replace(/\/$/, '')
  const res = await fetch(`${baseUrl}/audio/transcriptions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    const err = new Error(`Whisper API error: ${res.status} ${body}`.trim())
    err.status = res.status
    throw err
  }

  const data = await res.json()
  const text = data.text ?? ''

  return {
    text,
    provider: 'whisper',
    language: data.language ?? null,
    segments: data.segments ?? null,
  }
}
