/**
 * Lightweight face-region heuristic: samples the upper-center of the video frame.
 * Uses luminance variance + edge density (no ML) to detect likely face presence.
 */
export function checkFacePresence(videoEl, canvas, ctx) {
  if (!videoEl || !canvas || !ctx) return { present: true, warming: true }

  if (videoEl.readyState < 2 || !videoEl.videoWidth || !videoEl.videoHeight) {
    return { present: true, warming: true }
  }

  const vw = videoEl.videoWidth
  const vh = videoEl.videoHeight
  const sx = Math.floor(vw * 0.2)
  const sy = Math.floor(vh * 0.05)
  const sw = Math.floor(vw * 0.6)
  const sh = Math.floor(vh * 0.65)

  const size = 64
  canvas.width = size
  canvas.height = size

  try {
    ctx.drawImage(videoEl, sx, sy, sw, sh, 0, 0, size, size)
    const { data } = ctx.getImageData(0, 0, size, size)
    const pixels = data.length / 4
    let sum = 0
    let sumSq = 0
    let edgeHits = 0
    const w = size

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * w + x) * 4
        const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
        sum += lum
        sumSq += lum * lum

        if (x > 0 && y > 0) {
          const li = ((y - 1) * w + (x - 1)) * 4
          const prev = 0.299 * data[li] + 0.587 * data[li + 1] + 0.114 * data[li + 2]
          if (Math.abs(lum - prev) > 18) edgeHits += 1
        }
      }
    }

    const mean = sum / pixels
    const variance = sumSq / pixels - mean * mean
    const edgeRatio = edgeHits / pixels

    const tooDark = mean < 28
    const tooBrightFlat = mean > 200 && variance < 40
    const flatRegion = variance < 35
    const lowDetail = edgeRatio < 0.04

    const present =
      !tooDark &&
      !tooBrightFlat &&
      !flatRegion &&
      !lowDetail &&
      variance > 50 &&
      mean > 32 &&
      mean < 215 &&
      edgeRatio > 0.055

    return { present, warming: false, mean, variance, edgeRatio }
  } catch {
    return { present: true, warming: true }
  }
}
