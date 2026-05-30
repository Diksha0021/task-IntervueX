import * as chunkStore from '../../../store/chunkStore.js'
import { env } from '../../../config/env.js'
import { mergeChunkFilesOnDisk } from '../mergeMedia.js'

function chunkCloudKey(sessionId, filename) {
  return `recordings/${sessionId}/chunks/${filename}`
}

function mergedCloudKey(sessionId) {
  return `recordings/${sessionId}/merged.webm`
}

export function playbackPath(sessionId) {
  return `/api/recordings/${sessionId}/video`
}

export function absolutePlaybackUrl(sessionId) {
  const base = env.publicApiBaseUrl.replace(/\/$/, '')
  return `${base}${playbackPath(sessionId)}`
}

export class LocalStorageAdapter {
  async uploadChunk({ sessionId, sequenceNumber, buffer }) {
    const { key, path, duplicate } = chunkStore.saveChunk(sessionId, sequenceNumber, buffer)
    return {
      key,
      path,
      cloudKey: chunkCloudKey(sessionId, key),
      duplicate,
      size: buffer.length,
    }
  }

  async readChunkBuffer(sessionId, key) {
    return chunkStore.readChunk(sessionId, key)
  }

  async listChunkKeys(sessionId) {
    return chunkStore.listChunks(sessionId)
  }

  async mergeChunks(sessionId, keys) {
    const dir = chunkStore.getSessionUploadDir(sessionId)
    const mergedPath = chunkStore.getMergedPath(sessionId)
    const resolvedKeys = keys?.length ? keys : chunkStore.listChunks(sessionId)

    await mergeChunkFilesOnDisk({
      sessionId,
      dir,
      keys: resolvedKeys,
      outputPath: mergedPath,
      readChunk: (key) => chunkStore.readChunk(sessionId, key),
    })

    return {
      storageKey: mergedCloudKey(sessionId),
      localPath: mergedPath,
      url: absolutePlaybackUrl(sessionId),
      chunkCount: resolvedKeys.length,
    }
  }

  async getVideoUrl(sessionId) {
    const mergedPath = chunkStore.getMergedPath(sessionId)
    const { existsSync } = await import('fs')
    if (!existsSync(mergedPath)) {
      return null
    }
    return absolutePlaybackUrl(sessionId)
  }

  getLocalMergedPath(sessionId) {
    return chunkStore.getMergedPath(sessionId)
  }
}
