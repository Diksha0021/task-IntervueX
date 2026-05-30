import { isMongoConnected } from '../../config/db.js'
import InterviewAnalytics from '../../models/InterviewAnalytics.js'
import { updateSession, getSession } from '../../store/sessionStore.js'

export async function saveSessionAnalytics(sessionId, analytics) {
  if (!sessionId || !analytics) return null

  if (isMongoConnected()) {
    await InterviewAnalytics.findOneAndUpdate(
      { sessionId },
      { $set: { sessionId, ...analytics } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
  }

  const session = await getSession(sessionId)
  const existingReport = session?.session_data?.report

  const patch = { analytics }
  if (existingReport) {
    patch.report = {
      ...existingReport,
      analytics,
      scores: {
        ...existingReport.scores,
        communication:
          analytics.communicationScore ?? existingReport.scores?.communication,
        confidence: analytics.confidenceScore,
      },
    }
  }

  return updateSession(sessionId, patch)
}

export async function getSessionAnalytics(sessionId) {
  if (isMongoConnected()) {
    const doc = await InterviewAnalytics.findOne({ sessionId }).lean()
    if (doc) {
      const { _id, __v, createdAt, updatedAt, ...rest } = doc
      return rest
    }
  }

  const session = await getSession(sessionId)
  return session?.session_data?.analytics ?? null
}
