import { isSubstantiveAnswer, scoreSingleAnswer } from './answerQuality.js'

function formatProctoringFlags(tabWarnings, faceAbsenceWarnings, backendFlags = []) {
  const flags = []
  if (tabWarnings > 0) {
    flags.push(`Tab switched away ${tabWarnings} time${tabWarnings > 1 ? 's' : ''} (real-time proctoring)`)
  }
  if (faceAbsenceWarnings > 0) {
    flags.push(`Face not visible ${faceAbsenceWarnings} time${faceAbsenceWarnings > 1 ? 's' : ''} (camera proctoring)`)
  }
  for (const f of backendFlags) {
    if (typeof f === 'string' && !flags.includes(f)) flags.push(f)
  }
  return flags
}

function computeIntegrityScore(tabWarnings, faceAbsenceWarnings, emptyRate) {
  let score = 10
  score -= Math.min(tabWarnings * 2.5, 6)
  score -= Math.min(faceAbsenceWarnings * 1.5, 5)
  score -= Math.round(emptyRate * 4)
  return Math.max(0, Math.min(10, Math.round(score)))
}

export function generateInterviewReport({
  elapsed,
  tabWarnings = 0,
  faceAbsenceWarnings = 0,
  answers,
  questions,
  keywords = [],
  interviewTitle = 'Interview',
  backend = null,
  proctoringLog = [],
}) {
  const totalQuestions = questions.length
  const perQuestion = answers.map((a, i) => {
    const scored = scoreSingleAnswer(a.answer, keywords)
    return {
      index: i + 1,
      question: a.question,
      answer: a.answer,
      ...scored,
    }
  })

  const substantiveAnswers = perQuestion.filter((q) => q.substantive)
  const emptyCount = perQuestion.length - substantiveAnswers.length
  const emptyRate = perQuestion.length ? emptyCount / perQuestion.length : 1

  const communication = substantiveAnswers.length
    ? Math.round(
        substantiveAnswers.reduce((s, q) => s + q.communication, 0) / substantiveAnswers.length
      )
    : 0

  const technical = substantiveAnswers.length
    ? Math.round(
        substantiveAnswers.reduce((s, q) => s + q.technical, 0) / substantiveAnswers.length
      )
    : 0

  let overall = substantiveAnswers.length
    ? Math.round((communication + technical) / 2)
    : 0

  const integrityScore = computeIntegrityScore(tabWarnings, faceAbsenceWarnings, emptyRate)

  if (emptyRate >= 0.5) overall = Math.min(overall, 2)
  if (substantiveAnswers.length === 0) overall = 0
  if (tabWarnings >= 2 || faceAbsenceWarnings >= 3) overall = Math.min(overall, 3)

  const completionRate = Math.round((substantiveAnswers.length / totalQuestions) * 100)

  const proctoringFlags = formatProctoringFlags(
    tabWarnings,
    faceAbsenceWarnings,
    backend?.flags ?? []
  )

  const flags = [...proctoringFlags]
  if (emptyCount > 0) {
    flags.push(`${emptyCount} of ${totalQuestions} questions had no substantive answer`)
  }
  if (answers.length < totalQuestions) {
    flags.push(`Only ${answers.length} of ${totalQuestions} questions were submitted`)
  }

  const hasProctoringIssues = tabWarnings > 0 || faceAbsenceWarnings > 0
  const hasSubmissionGaps = answers.length < totalQuestions || emptyCount > 0
  const isFlagged =
    flags.length > 0 ||
    hasProctoringIssues ||
    hasSubmissionGaps ||
    integrityScore <= 6 ||
    emptyRate >= 0.34 ||
    substantiveAnswers.length === 0

  let recommendation = 'Review Pending'
  if (isFlagged) {
    if (hasProctoringIssues && hasSubmissionGaps) {
      recommendation = 'Flagged — proctoring and incomplete submission'
    } else if (hasProctoringIssues) {
      recommendation = 'Flagged — proctoring concerns'
    } else if (hasSubmissionGaps || substantiveAnswers.length === 0) {
      recommendation = 'Flagged — incomplete submission'
    } else {
      recommendation = 'Flagged'
    }
  } else if (
    overall >= 7 &&
    tabWarnings === 0 &&
    faceAbsenceWarnings === 0 &&
    emptyRate === 0
  ) {
    recommendation = 'Strong Candidate'
  } else if (overall >= 5) {
    recommendation = 'Review Pending'
  } else {
    recommendation = 'Needs Review — weak responses'
  }

  const strengths = []
  const improvements = []

  if (substantiveAnswers.length === 0) {
    improvements.push('No substantive verbal answers were recorded — scores reflect missing responses')
  } else {
    if (communication >= 7) strengths.push('Clear, detailed communication on answered questions')
    else improvements.push('Expand spoken answers with more detail and examples')
    if (technical >= 7) strengths.push(`Good ${interviewTitle} technical depth where answered`)
    else improvements.push('Use more role-specific terminology and concrete examples')
  }

  if (tabWarnings === 0 && faceAbsenceWarnings === 0) {
    strengths.push('Proctoring: no tab switches or face-absence events detected')
  } else {
    improvements.push('Address proctoring flags before advancing this candidate')
  }

  if (integrityScore >= 8) strengths.push(`High session integrity (${integrityScore}/10)`)

  const summary =
    `Interview "${interviewTitle}": ${substantiveAnswers.length}/${totalQuestions} substantive answers in ${Math.floor(elapsed / 60)}m ${elapsed % 60}s. `
    + `Scores (substantive answers only): Communication ${communication}/10, Technical ${technical}/10, Overall ${overall}/10. `
    + `Integrity ${integrityScore}/10 (tab switches: ${tabWarnings}, face absence events: ${faceAbsenceWarnings}). `
    + `Recommendation: ${recommendation}.`

  return {
    id: `RPT-${Date.now()}`,
    sessionId: backend?.sessionId ?? null,
    interviewTitle,
    completedAt: new Date().toLocaleString(),
    duration: elapsed,
    durationFormatted: `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`,
    questionsTotal: totalQuestions,
    questionsAnswered: answers.length,
    substantiveAnswerCount: substantiveAnswers.length,
    emptyAnswerCount: emptyCount,
    completionRate,
    scores: { communication, technical, overall, integrity: integrityScore },
    tabWarnings,
    faceAbsenceWarnings,
    integrityScore,
    proctoringLog,
    flags,
    flagged: isFlagged,
    recommendation,
    summary,
    strengths,
    improvements,
    perQuestion,
    answers,
    fullTranscript: backend?.transcription ?? null,
    mergeStatus: backend?.mergeStatus ?? 'pending',
    transcriptionStatus: backend?.transcriptionStatus ?? 'pending',
  }
}

/** True when the candidate should appear in the recruiter Flagged filter. */
export function isCandidateFlagged(candidate) {
  if (!candidate) return false
  if (candidate.status === 'Approved' || candidate.status === 'Rejected') return false
  if (candidate.status === 'Flagged') return true
  if (candidate.flagged === true || candidate.report?.flagged === true) return true

  const rec = (candidate.recommendation ?? '').toLowerCase()
  if (rec.includes('flagged') || rec.includes('incomplete') || rec.includes('needs review')) {
    return true
  }

  if ((candidate.tabWarnings ?? 0) > 0) return true
  if ((candidate.faceAbsenceWarnings ?? 0) > 0) return true

  const flagItems = candidate.flagsList ?? candidate.report?.flags ?? []
  if (flagItems.length > 0) return true

  if ((candidate.integrityScore ?? 10) < 7) return true

  const total = candidate.report?.questionsTotal ?? 6
  const answered = candidate.report?.questionsAnswered ?? 0
  if (answered > 0 && answered < total) return true
  if (answered === 0 && total > 0) return true

  return false
}

export function getCandidateDisplayStatus(candidate) {
  if (candidate.status === 'Approved' || candidate.status === 'Rejected') {
    return candidate.status
  }
  if (isCandidateFlagged(candidate)) return 'Flagged'
  return candidate.status ?? 'Review Pending'
}

export function formatReportForDownload(report) {
  const lines = [
    'INTERVUEX — INTERVIEW REPORT',
    `Track: ${report.interviewTitle}`,
    `Completed: ${report.completedAt}`,
    `Duration: ${report.durationFormatted}`,
    `Recommendation: ${report.recommendation}`,
    '',
    'SCORES (substantive answers only)',
    `Communication: ${report.scores.communication}/10`,
    `Technical: ${report.scores.technical}/10`,
    `Overall: ${report.scores.overall}/10`,
    `Integrity: ${report.scores.integrity}/10`,
    ...(report.analytics
      ? [
          '',
          'ANALYTICS',
          `Speaking time: ${report.analytics.speakingTimeFormatted ?? '—'}`,
          `Total words: ${report.analytics.totalWordsSpoken ?? 0}`,
          `Avg answer length: ${report.analytics.averageAnswerLength ?? 0} words`,
          `Filler words: ${report.analytics.fillerWordCount ?? 0}`,
          `Confidence: ${report.analytics.confidenceScore ?? '—'}/10`,
          `Keyword match: ${report.analytics.keywordMatchScore ?? 0}%`,
        ]
      : []),
    `Substantive answers: ${report.substantiveAnswerCount}/${report.questionsTotal}`,
    '',
    'PROCTORING',
    `Tab switches: ${report.tabWarnings}`,
    `Face absence events: ${report.faceAbsenceWarnings}`,
    '',
    'SUMMARY',
    report.summary,
    '',
    'STRENGTHS',
    ...report.strengths.map((s) => `- ${s}`),
    '',
    'AREAS FOR IMPROVEMENT',
    ...report.improvements.map((s) => `- ${s}`),
    '',
    'FLAGS',
    ...(report.flags.length ? report.flags.map((f) => `- ${f}`) : ['- None']),
    '',
    'Q&A TRANSCRIPT',
  ]

  report.answers.forEach((item, i) => {
    const substantive = isSubstantiveAnswer(item.answer) ? '✓' : '✗ empty'
    lines.push(`\nQ${i + 1}: ${item.question}`)
    lines.push(`A (${substantive}): ${item.answer}`)
  })

  return lines.join('\n')
}
