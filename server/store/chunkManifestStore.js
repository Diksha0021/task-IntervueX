import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import * as chunkStore from './chunkStore.js'

const UPLOADS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'uploads')

function manifestPath(sessionId) {
  return join(chunkStore.getSessionUploadDir(sessionId), 'chunk-registry.json')
}

function readManifest(sessionId) {
  const path = manifestPath(sessionId)
  if (!existsSync(path)) return { chunks: [] }
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return { chunks: [] }
  }
}

function writeManifest(sessionId, data) {
  chunkStore.getSessionUploadDir(sessionId)
  writeFileSync(manifestPath(sessionId), JSON.stringify(data, null, 2), 'utf8')
}

export function findChunkByChunkId(sessionId, chunkId) {
  const manifest = readManifest(sessionId)
  return manifest.chunks.find((c) => c.chunkId === chunkId) ?? null
}

export function registerChunk(sessionId, record) {
  const manifest = readManifest(sessionId)
  if (manifest.chunks.some((c) => c.chunkId === record.chunkId)) {
    return { duplicate: true, record: manifest.chunks.find((c) => c.chunkId === record.chunkId) }
  }
  manifest.chunks.push(record)
  manifest.chunks.sort((a, b) => a.sequenceNumber - b.sequenceNumber)
  writeManifest(sessionId, manifest)
  return { duplicate: false, record }
}

export function listChunkRecords(sessionId) {
  return readManifest(sessionId).chunks
}
