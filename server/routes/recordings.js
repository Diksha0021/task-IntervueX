import { Router } from 'express'
import { createReadStream, existsSync } from 'fs'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/asyncHandler.js'
import { getSession } from '../store/sessionStore.js'
import { getRecordingStorage } from '../services/storage/index.js'
import { enqueueMerge } from '../queues/audioMergeQueue.js'
import { env } from '../config/env.js'

const router = Router()

const LEGACY_RECRUITER_EMAIL = 'recruiter@demo.com'

function canAccessRecording(user, session) {
  if (!user || !session) return false
  if (user.role === 'recruiter') {
    const ownerId = session.session_data?.recruiterId ?? session.recruiterId
    if (ownerId) return ownerId === user.id
    return user.email?.toLowerCase() === LEGACY_RECRUITER_EMAIL
  }
  return session.userId === user.id
}

router.get(
  '/:sessionId/video',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params
    const session = await getSession(sessionId)
    if (!session) {
      return res.status(404).json({ error: 'Session not found' })
    }
    if (!canAccessRecording(req.user, session)) {
      return res.status(403).json({ error: 'Access denied' })
    }

    const storage = getRecordingStorage()
    const url = await storage.getVideoUrl(sessionId)

    if (url?.startsWith('http://') || url?.startsWith('https://')) {
      if (env.storageProvider === 's3' && env.s3.bucket) {
        return res.redirect(302, url)
      }
    }

    const localPath = storage.getLocalMergedPath(sessionId)
    if (!existsSync(localPath)) {
      const mergeStatus = session.session_data?.mergeStatus
      return res.status(404).json({
        error: 'Recording not available',
        mergeStatus: mergeStatus ?? 'pending',
      })
    }

    res.setHeader('Content-Type', 'video/webm')
    res.setHeader('Accept-Ranges', 'bytes')
    createReadStream(localPath).pipe(res)
  })
)

router.post(
  '/:sessionId/remerge',
  requireAuth,
  requireRole('recruiter'),
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params
    const session = await getSession(sessionId)
    if (!session) {
      return res.status(404).json({ error: 'Session not found' })
    }

    const chunkCount =
      session.session_data?.chunkCount ??
      session.session_data?.uploadedChunkKeys?.length ??
      0
    if (chunkCount === 0) {
      return res.status(409).json({ error: 'No recording chunks available to re-merge' })
    }

    const result = await enqueueMerge(sessionId, { force: true })
    res.json({
      ok: true,
      chunkCount: result.chunkCount,
      recordingUrl: `/api/recordings/${sessionId}/video`,
    })
  })
)

export default router
