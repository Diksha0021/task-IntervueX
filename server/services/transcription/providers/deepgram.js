import { readFileSync } from 'fs'
import { env } from '../../../config/env.js'

export async function transcribeWithDeepgram(filePath) {
  const apiKey = env.transcription.deepgramApiKey
  if (!apiKey) {
    const err = new Error('DEEPGRAM_API_KEY is not configured')
    err.status = 400
    throw err
  }

  const buffer = readFileSync(filePath)
  const res = await fetch(
    'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true',
    {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'audio/webm',
      },
      body: buffer,
    }
  )

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    const err = new Error(`Deepgram error: ${res.status} ${body}`.trim())
    err.status = res.status
    throw err
  }

  const data = await res.json()
  const text = data.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? ''

  return {
    text,
    provider: 'deepgram',
    language: data.results?.channels?.[0]?.detected_language ?? null,
    segments: data.results?.channels?.[0]?.alternatives?.[0]?.words ?? null,
  }
}
