const MESSAGES = {
  camera_denied:
    'Camera access was blocked. Click the lock icon in your browser address bar, allow camera access, then click Try again.',
  microphone_denied:
    'Microphone access was blocked. Allow microphone permission in your browser settings, then try again.',
  camera_mic_denied:
    'Camera and microphone access were blocked. Allow both in your browser settings, then click Try again.',
  camera_not_found: 'No camera was detected on this device. Connect a webcam or use another device.',
  microphone_not_found: 'No microphone was detected. Connect a mic or check system sound settings.',
  camera_in_use:
    'Your camera or microphone is being used by another app. Close other video apps and try again.',
  camera_unsupported: 'This browser does not support camera access. Try Chrome or Edge on desktop.',
  network_offline:
    'You appear to be offline. Your answers and recording chunks are saved locally and will sync when you reconnect.',
  network_restored: 'Connection restored. Uploading saved data…',
  api_unreachable:
    'Cannot reach the interview server. Your progress is saved on this device and will sync when the server is back.',
  api_restored: 'Server connection restored.',
  chunk_upload_failed:
    'A recording segment failed to upload after several tries. It stays saved on this device — use Retry uploads when online.',
  chunk_duplicate_skipped: 'A duplicate recording segment was skipped (already uploaded).',
  server_error: 'Something went wrong on our servers. Please wait a moment and try again.',
  session_restore_failed:
    'Could not restore your previous session from the server. Using saved progress on this device.',
  session_restored:
    'Your interview was restored from your last saved progress. Re-enable camera and microphone to continue.',
  speech_not_allowed:
    'Speech recognition is blocked. Allow microphone access and ensure you are on HTTPS or localhost.',
  speech_network: 'Speech recognition lost network connection. It will retry automatically.',
  speech_unavailable: 'Speech recognition is unavailable in this browser. You can still type answers if enabled.',
  recording_no_stream: 'Recording needs an active camera stream. Enable camera and microphone first.',
  recording_failed: 'Could not start video recording. Refresh the page and allow camera access.',
  refresh_recovery:
    'Page refreshed — your answers were restored. Turn camera and microphone back on to continue recording.',
  storage_upload_failed:
    'Cloud storage upload failed. Your recording is saved on the server disk and will be retried.',
  generic: 'Something went wrong. Please try again or refresh the page.',
}

export function getUserMessage(code, fallback) {
  return MESSAGES[code] ?? fallback ?? MESSAGES.generic
}

export function messageFromError(err, context = {}) {
  if (!err) return getUserMessage('generic')

  if (err.offline || err.message === 'offline') {
    return getUserMessage('network_offline')
  }

  const msg = (err.message ?? '').toLowerCase()
  const status = err.status ?? err.statusCode

  if (status >= 500) return getUserMessage('server_error')
  if (msg.includes('session not found')) return getUserMessage('session_restore_failed')

  if (context.category === 'camera') {
    if (err.name === 'NotAllowedError') return getUserMessage('camera_denied')
    if (err.name === 'NotFoundError') return getUserMessage('camera_not_found')
    if (err.name === 'NotReadableError') return getUserMessage('camera_in_use')
  }

  if (context.category === 'microphone') {
    if (err.name === 'NotAllowedError') return getUserMessage('microphone_denied')
    if (err.name === 'NotFoundError') return getUserMessage('microphone_not_found')
  }

  if (msg.includes('failed to fetch') || msg.includes('network')) {
    return getUserMessage('network_offline')
  }

  return err.userMessage ?? err.message ?? getUserMessage('generic')
}
