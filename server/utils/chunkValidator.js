const MIN_CHUNK_BYTES = 128

/** WebM/Matroska EBML header */
function looksLikeWebM(buffer) {
  return (
    buffer.length >= 4 &&
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  )
}

/**
 * Normalize MIME from multer + filename (.webm chunks).
 * Browsers often send application/octet-stream — always map to video/webm when possible.
 */
export function resolveChunkMime(mimeType, filename = '') {
  const raw = (mimeType ?? '').split(';')[0].trim().toLowerCase()
  const name = (filename ?? '').toLowerCase()

  if (raw.startsWith('video/') || raw.startsWith('audio/')) {
    return raw
  }

  if (raw && raw !== 'application/octet-stream' && !raw.startsWith('text/')) {
    if (raw.startsWith('application/')) {
      if (name.endsWith('.webm')) return 'video/webm'
      if (name.endsWith('.mp4')) return 'video/mp4'
      return raw
    }
    return raw
  }

  if (name.endsWith('.webm')) return 'video/webm'
  if (name.endsWith('.mp4')) return 'video/mp4'
  if (name.endsWith('.ogg')) return 'audio/ogg'

  return 'video/webm'
}

/**
 * Validate uploaded chunk bytes.
 * MIME is normalized for storage only — we do not reject valid media based on browser MIME quirks.
 */
export function validateChunk(buffer, mimeType, filename = '') {
  const size = buffer?.length ?? 0

  if (!buffer || size < MIN_CHUNK_BYTES) {
    return { valid: false, reason: 'empty_or_too_small', size }
  }

  const resolvedMime = resolveChunkMime(mimeType, filename)

  if (
    filename.toLowerCase().endsWith('.webm') &&
    !looksLikeWebM(buffer) &&
    size < 512
  ) {
    return { valid: false, reason: 'invalid_webm_header', size, mimeType: resolvedMime }
  }

  return { valid: true, size, mimeType: resolvedMime }
}
