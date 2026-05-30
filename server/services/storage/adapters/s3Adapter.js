import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import * as chunkStore from '../../../store/chunkStore.js'
import { env } from '../../../config/env.js'
import { mergeChunkFilesOnDisk } from '../mergeMedia.js'
import { log } from '../../../utils/logger.js'
import { withRetry } from '../../../utils/retry.js'

function chunkObjectKey(sessionId, filename) {
  return `recordings/${sessionId}/chunks/${filename}`
}

function mergedObjectKey(sessionId) {
  return `recordings/${sessionId}/merged.webm`
}

let s3Client = null
let s3Commands = null
let getSignedUrlFn = null

async function getS3() {
  if (s3Client) {
    return { client: s3Client, commands: s3Commands, getSignedUrl: getSignedUrlFn }
  }

  const [{ S3Client, GetObjectCommand, PutObjectCommand }, { getSignedUrl }] = await Promise.all([
    import('@aws-sdk/client-s3'),
    import('@aws-sdk/s3-request-presigner'),
  ])

  s3Client = new S3Client({
    region: env.s3.region,
    credentials: env.s3.accessKeyId
      ? {
          accessKeyId: env.s3.accessKeyId,
          secretAccessKey: env.s3.secretAccessKey,
        }
      : undefined,
    endpoint: env.s3.endpoint || undefined,
    forcePathStyle: env.s3.forcePathStyle,
  })

  s3Commands = { GetObjectCommand, PutObjectCommand }
  getSignedUrlFn = getSignedUrl
  return { client: s3Client, commands: s3Commands, getSignedUrl: getSignedUrlFn }
}

export class S3StorageAdapter {
  async uploadChunk({ sessionId, sequenceNumber, buffer, mimeType }) {
    const { key, path, duplicate } = chunkStore.saveChunk(sessionId, sequenceNumber, buffer)
    const cloudKey = chunkObjectKey(sessionId, key)

    const { client, commands } = await getS3()
    try {
      await withRetry(
        () =>
          client.send(
            new commands.PutObjectCommand({
              Bucket: env.s3.bucket,
              Key: cloudKey,
              Body: buffer,
              ContentType: mimeType || 'video/webm',
            })
          ),
        {
          maxAttempts: 3,
          baseDelayMs: 1000,
          label: 's3_put_chunk',
          shouldRetry: (err) => {
            const msg = err?.message ?? ''
            return /timeout|ECONNRESET|ETIMEDOUT|503|500|SlowDown/i.test(msg)
          },
        }
      )
    } catch (err) {
      log('error', 'S3 chunk upload failed after retries', {
        sessionId,
        cloudKey,
        error: err.message,
        localPath: path,
      })
      const uploadErr = new Error('Storage upload failed — chunk saved locally and can be retried')
      uploadErr.status = 503
      uploadErr.code = 'STORAGE_UPLOAD_FAILED'
      throw uploadErr
    }

    log('debug', 'Chunk uploaded to S3', { sessionId, cloudKey, size: buffer.length })

    return {
      key,
      path,
      cloudKey,
      duplicate,
      size: buffer.length,
    }
  }

  async readChunkBuffer(sessionId, key) {
    const cloudKey = chunkObjectKey(sessionId, key)
    const { client, commands } = await getS3()
    const response = await client.send(
      new commands.GetObjectCommand({
        Bucket: env.s3.bucket,
        Key: cloudKey,
      })
    )
    const bytes = await response.Body.transformToByteArray()
    return Buffer.from(bytes)
  }

  async listChunkKeys(sessionId) {
    return chunkStore.listChunks(sessionId)
  }

  async mergeChunks(sessionId, keys) {
    const resolvedKeys = keys?.length ? keys : chunkStore.listChunks(sessionId)
    if (resolvedKeys.length === 0) {
      throw new Error('No chunks to merge')
    }

    const workDir = join(tmpdir(), 'intervuex-merge', sessionId)
    mkdirSync(workDir, { recursive: true })

    try {
      for (const key of resolvedKeys) {
        const buffer = await this.readChunkBuffer(sessionId, key)
        writeFileSync(join(workDir, key), buffer)
      }

      const mergedPath = join(workDir, 'merged.webm')
      await mergeChunkFilesOnDisk({
        sessionId,
        dir: workDir,
        keys: resolvedKeys,
        outputPath: mergedPath,
        readChunk: (key) => readFileSync(join(workDir, key)),
      })

      const mergedBuffer = readFileSync(mergedPath)
      const storageKey = mergedObjectKey(sessionId)
      const { client, presigner } = await getS3()

      await client.send(
        new presigner.PutObjectCommand({
          Bucket: env.s3.bucket,
          Key: storageKey,
          Body: mergedBuffer,
          ContentType: 'video/webm',
        })
      )

      chunkStore.getSessionUploadDir(sessionId)
      writeFileSync(chunkStore.getMergedPath(sessionId), mergedBuffer)

      const url = await this.getSignedUrlForKey(storageKey)

      return {
        storageKey,
        localPath: chunkStore.getMergedPath(sessionId),
        url,
        chunkCount: resolvedKeys.length,
      }
    } finally {
      if (existsSync(workDir)) {
        try {
          rmSync(workDir, { recursive: true, force: true })
        } catch {
          /* ignore cleanup errors */
        }
      }
    }
  }

  async getSignedUrlForKey(key) {
    const { client, commands, getSignedUrl } = await getS3()
    return getSignedUrl(
      client,
      new commands.GetObjectCommand({
        Bucket: env.s3.bucket,
        Key: key,
      }),
      { expiresIn: env.s3.signedUrlTtlSeconds }
    )
  }

  async getVideoUrl(sessionId, { storageKey } = {}) {
    const key = storageKey ?? mergedObjectKey(sessionId)
    try {
      return await this.getSignedUrlForKey(key)
    } catch (err) {
      log('warn', 'Could not generate S3 playback URL', { sessionId, error: err.message })
      return null
    }
  }
}
