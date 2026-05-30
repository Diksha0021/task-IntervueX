import { spawn } from 'child_process'
import { existsSync, writeFileSync } from 'fs'
import { join } from 'path'
import { log } from '../../utils/logger.js'

function isEbmlHeader(buffer) {
  return (
    buffer.length >= 4 &&
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  )
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    proc.stderr.on('data', (d) => {
      stderr += d.toString()
    })
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(stderr || `FFmpeg exited with code ${code}`))
    })
    proc.on('error', reject)
  })
}

export function checkFfmpeg() {
  return new Promise((resolve) => {
    const proc = spawn('ffmpeg', ['-version'], { stdio: 'ignore' })
    proc.on('error', () => resolve(false))
    proc.on('close', (code) => resolve(code === 0))
  })
}

/** Re-encode merged chunks — fixes A/V drift from timesliced MediaRecorder segments. */
export function runFfmpegReencode(listPath, outputPath) {
  return runFfmpeg([
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    listPath,
    '-map',
    '0:v:0?',
    '-map',
    '0:a:0?',
    '-c:v',
    'libvpx-vp8',
    '-deadline',
    'good',
    '-cpu-used',
    '4',
    '-b:v',
    '1.2M',
    '-c:a',
    'libopus',
    '-b:a',
    '128k',
    '-application',
    'audio',
    '-avoid_negative_ts',
    'make_zero',
    '-fflags',
    '+genpts',
    '-max_muxing_queue_size',
    '1024',
    '-y',
    outputPath,
  ])
}

/** Fast concat when each chunk is a full WebM (legacy timeslice mode). */
export function runFfmpegCopy(listPath, outputPath) {
  return runFfmpeg([
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    listPath,
    '-c',
    'copy',
    '-avoid_negative_ts',
    'make_zero',
    '-fflags',
    '+genpts',
    '-y',
    outputPath,
  ])
}

/**
 * Continuation-style chunks: only the first blob has an EBML header; the rest are
 * media clusters that can be appended directly while preserving A/V sync.
 */
export function concatContinuationChunks(buffers) {
  if (buffers.length === 0) throw new Error('No chunks to merge')
  if (buffers.length === 1) return buffers[0]

  const initCount = buffers.filter(isEbmlHeader).length
  if (initCount === 1 && !isEbmlHeader(buffers[1])) {
    return Buffer.concat(buffers)
  }

  return null
}

/**
 * Merge chunk files on disk into a single WebM.
 * @param {{ sessionId: string, dir: string, keys: string[], outputPath: string, readChunk: (key: string) => Buffer|null }} opts
 */
export async function mergeChunkFilesOnDisk({ sessionId, dir, keys, outputPath, readChunk }) {
  if (keys.length === 0) {
    throw new Error('No chunks to merge')
  }

  const buffers = keys.map((key) => readChunk(key)).filter(Boolean)
  if (buffers.length !== keys.length) {
    throw new Error('One or more chunk files are missing on disk')
  }

  const continuation = concatContinuationChunks(buffers)
  if (continuation) {
    writeFileSync(outputPath, continuation)
    log('info', 'Merged recording via continuation chunk concat (A/V sync preserved)', {
      sessionId,
      chunkCount: keys.length,
    })
    return
  }

  const listPath = join(dir, 'chunks.txt')
  const listContent = keys
    .map((key) => `file '${join(dir, key).replace(/\\/g, '/')}'`)
    .join('\n')
  writeFileSync(listPath, listContent, 'utf8')

  const ffmpegAvailable = await checkFfmpeg()

  if (ffmpegAvailable) {
    try {
      await runFfmpegReencode(listPath, outputPath)
      log('info', 'Merged recording via FFmpeg re-encode (A/V sync corrected)', {
        sessionId,
        chunkCount: keys.length,
      })
      return
    } catch (reencodeErr) {
      log('warn', 'FFmpeg re-encode merge failed, trying stream copy', {
        sessionId,
        error: reencodeErr.message?.slice(0, 200),
      })
      try {
        await runFfmpegCopy(listPath, outputPath)
        log('warn', 'Merged recording via FFmpeg copy — A/V sync may drift on long interviews', {
          sessionId,
          chunkCount: keys.length,
        })
        return
      } catch (copyErr) {
        log('warn', 'FFmpeg copy merge failed', {
          sessionId,
          error: copyErr.message?.slice(0, 200),
        })
      }
    }
  }

  log('warn', 'FFmpeg not found — concatenating raw bytes (install FFmpeg for proper A/V sync)', {
    sessionId,
  })
  writeFileSync(outputPath, Buffer.concat(buffers))
}

export function mergedExists(outputPath) {
  return existsSync(outputPath)
}
