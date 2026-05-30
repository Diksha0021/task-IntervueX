import { Router } from 'express'
import { log } from '../utils/logger.js'
import { asyncHandler } from '../middleware/asyncHandler.js'

const router = Router()

router.post(
  '/client',
  asyncHandler(async (req, res) => {
    const logs = Array.isArray(req.body?.logs) ? req.body.logs : [req.body].filter(Boolean)

    for (const entry of logs.slice(0, 20)) {
      const level = entry?.level === 'warn' ? 'warn' : 'error'
      log(level, `[client] ${entry?.message ?? 'client event'}`, {
        category: entry?.category,
        sessionId: entry?.sessionId,
        url: entry?.url,
        ...entry,
        message: undefined,
        level: undefined,
      })
    }

    res.json({ ok: true, received: logs.length })
  })
)

export default router
