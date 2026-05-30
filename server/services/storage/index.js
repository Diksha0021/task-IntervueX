export {
  getRecordingStorage,
  resolvePublicRecordingUrl,
  RecordingStorageService,
} from './recordingStorageService.js'

/** Upload a single interview chunk to configured cloud/local storage. */
export async function uploadChunk(params) {
  return getRecordingStorage().uploadChunk(params)
}

/** Merge session chunks into one recording and persist URL on the session. */
export async function mergeChunks(sessionId) {
  return getRecordingStorage().mergeChunks(sessionId)
}

/** Resolve a playback URL for the merged recording. */
export async function getVideoUrl(sessionId, options) {
  return getRecordingStorage().getVideoUrl(sessionId, options)
}
