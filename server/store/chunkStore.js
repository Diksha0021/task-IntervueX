import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const UPLOADS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'uploads')

export function getSessionUploadDir(sessionId) {
  const dir = join(UPLOADS_DIR, sessionId)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function chunkKey(sequence) {
  return `chunk_${String(sequence).padStart(3, '0')}.webm`
}

export function chunkExists(sessionId, sequence) {
  const path = join(getSessionUploadDir(sessionId), chunkKey(sequence))
  return existsSync(path)
}

/** Write chunk to uploads/{sessionId}/chunk_NNN.webm — skip if already present. */
export function saveChunk(sessionId, sequence, buffer) {
  const dir = getSessionUploadDir(sessionId)
  const filename = chunkKey(sequence)
  const filePath = join(dir, filename)

  if (existsSync(filePath)) {
    return { key: filename, path: filePath, sequence, duplicate: true }
  }

  writeFileSync(filePath, buffer)
  return { key: filename, path: filePath, sequence, duplicate: false }
}

export function listChunks(sessionId) {
  const dir = getSessionUploadDir(sessionId)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.startsWith('chunk_') && f.endsWith('.webm'))
    .sort()
}

export function readChunk(sessionId, key) {
  const path = join(getSessionUploadDir(sessionId), key)
  if (!existsSync(path)) return null
  return readFileSync(path)
}

export function getMergedPath(sessionId) {
  return join(getSessionUploadDir(sessionId), 'merged.webm')
}
