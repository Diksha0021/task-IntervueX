import { getSession } from '../../store/sessionStore.js'
import { getKeywordsForProfile } from '../../config/interviewProfiles.js'
import { generateInterviewAnalytics } from './interviewAnalytics.js'
import { saveSessionAnalytics } from './analyticsStore.js'
import { log } from '../../utils/logger.js'

export { generateInterviewAnalytics } from './interviewAnalytics.js'
export { getSessionAnalytics, saveSessionAnalytics } from './analyticsStore.js'

/**
 * Build analytics from session + report and persist to DB / session_data.
 */
export async function generateAndSaveSessionAnalytics(sessionId, { report, incoming = {} } = {}) {
  const session = await getSession(sessionId)
  if (!session) {
    throw new Error('Session not found')
  }

  const sd = session.session_data ?? {}
  const reportData = report ?? sd.report
  if (!reportData) {
    throw new Error('Report required to generate analytics')
  }

  const answers = reportData.answers ?? sd.answers ?? []
  const profileId = sd.interviewProfileId ?? incoming.interviewProfileId
  const keywords =
    incoming.interviewKeywords ??
    sd.interviewKeywords ??
    getKeywordsForProfile(profileId)

  const analytics = generateInterviewAnalytics({
    answers,
    keywords,
    elapsedSeconds: reportData.duration ?? sd.elapsed ?? incoming.elapsed ?? 0,
    serverTranscript: sd.serverTranscript ?? sd.transcription ?? reportData.fullTranscript ?? '',
    report: reportData,
  })

  const saved = await saveSessionAnalytics(sessionId, analytics)

  log('info', 'Interview analytics generated', {
    sessionId,
    totalWordsSpoken: analytics.totalWordsSpoken,
    confidenceScore: analytics.confidenceScore,
    keywordMatchScore: analytics.keywordMatchScore,
  })

  return { analytics, session: saved }
}
