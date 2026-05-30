const WORDS_PER_SECOND = 2.5 // ~150 WPM average speaking rate

const FILLER_PHRASES = [
  'you know',
  'i mean',
  'kind of',
  'sort of',
  'you see',
  'okay so',
  'so yeah',
]

const FILLER_WORDS = [
  'um',
  'uh',
  'umm',
  'uhh',
  'er',
  'ah',
  'like',
  'basically',
  'actually',
  'literally',
  'right',
  'okay',
  'so',
  'well',
  'yeah',
]

const NO_ANSWER_PATTERNS = [
  '(no verbal response',
  'no verbal response recorded',
  'no answer',
  'skipped',
  'n/a',
]

function countWords(text) {
  if (!text || typeof text !== 'string') return 0
  return text.trim().split(/\s+/).filter(Boolean).length
}

function isSubstantiveAnswer(text) {
  const raw = (text ?? '').trim()
  if (!raw) return false
  const lower = raw.toLowerCase()
  if (NO_ANSWER_PATTERNS.some((p) => lower.includes(p))) return false
  const words = countWords(raw)
  if (words < 5 || raw.length < 20) return false
  return true
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function detectFillers(text) {
  const lower = (text ?? '').toLowerCase()
  const found = new Map()
  let total = 0

  for (const phrase of FILLER_PHRASES) {
    const re = new RegExp(`\\b${escapeRegex(phrase)}\\b`, 'gi')
    const matches = lower.match(re)
    if (matches?.length) {
      total += matches.length
      found.set(phrase, (found.get(phrase) ?? 0) + matches.length)
    }
  }

  for (const word of FILLER_WORDS) {
    const re = new RegExp(`\\b${escapeRegex(word)}\\b`, 'gi')
    const matches = lower.match(re)
    if (matches?.length) {
      total += matches.length
      found.set(word, (found.get(word) ?? 0) + matches.length)
    }
  }

  const topFillers = [...found.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word, count]) => ({ word, count }))

  return { fillerWordCount: total, fillerWordsDetected: topFillers }
}

function matchKeywords(text, keywords = []) {
  const lower = (text ?? '').toLowerCase()
  const matched = []
  for (const kw of keywords) {
    const k = kw.toLowerCase()
    if (k && lower.includes(k)) matched.push(kw)
  }
  return matched
}

function round1(n) {
  return Math.round(n * 10) / 10
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

/**
 * Generate interview analytics from answers and optional report context.
 */
export function generateInterviewAnalytics({
  answers = [],
  keywords = [],
  elapsedSeconds = 0,
  serverTranscript = '',
  report = null,
}) {
  const perAnswer = answers.map((item, index) => {
    const answerText = item.answer ?? ''
    const wordCount = countWords(answerText)
    const substantive = isSubstantiveAnswer(answerText)
    const { fillerWordCount } = detectFillers(answerText)
    const keywordsMatched = matchKeywords(answerText, keywords)
    const estimatedSpeakingSeconds = substantive
      ? round1(wordCount / WORDS_PER_SECOND)
      : 0

    return {
      questionIndex: index,
      question: item.question ?? '',
      wordCount,
      substantive,
      fillerWordCount,
      keywordHits: keywordsMatched.length,
      keywordsMatched,
      estimatedSpeakingSeconds,
      averageAnswerLength: wordCount,
    }
  })

  const substantiveAnswers = perAnswer.filter((a) => a.substantive)
  const totalWordsSpoken = perAnswer.reduce((sum, a) => sum + a.wordCount, 0)
  const speakingTimeSeconds = round1(
    substantiveAnswers.reduce((sum, a) => sum + a.estimatedSpeakingSeconds, 0)
  )

  const answeredCount = perAnswer.length || 1
  const averageAnswerLength = round1(
    substantiveAnswers.length
      ? substantiveAnswers.reduce((s, a) => s + a.wordCount, 0) / substantiveAnswers.length
      : 0
  )

  const { fillerWordCount, fillerWordsDetected } = detectFillers(
    answers.map((a) => a.answer).join(' ')
  )

  const allMatchedKeywords = new Set()
  perAnswer.forEach((a) => a.keywordsMatched.forEach((k) => allMatchedKeywords.add(k.toLowerCase())))
  if (serverTranscript) {
    matchKeywords(serverTranscript, keywords).forEach((k) => allMatchedKeywords.add(k.toLowerCase()))
  }

  const keywordsTotal = keywords.length
  const keywordMatchScore =
    keywordsTotal > 0
      ? Math.round((allMatchedKeywords.size / keywordsTotal) * 100)
      : 0

  const fillerRate = totalWordsSpoken > 0 ? fillerWordCount / totalWordsSpoken : 0
  const substantiveRate = perAnswer.length
    ? substantiveAnswers.length / perAnswer.length
    : 0

  let confidenceScore = 5
  if (substantiveAnswers.length > 0) {
    const avgWords = averageAnswerLength
    confidenceScore =
      4 +
      Math.min(3, avgWords / 25) +
      substantiveRate * 2 -
      Math.min(2.5, fillerRate * 40)
    if (avgWords >= 40) confidenceScore += 0.5
    if (substantiveRate >= 0.85) confidenceScore += 0.5
  } else {
    confidenceScore = 1
  }
  confidenceScore = Math.round(clamp(confidenceScore, 0, 10))

  let communicationScore = report?.scores?.communication
  if (communicationScore == null) {
    communicationScore = substantiveAnswers.length
      ? Math.round(
          clamp(
            3 +
              averageAnswerLength / 12 +
              substantiveRate * 3 -
              Math.min(3, fillerRate * 35),
            0,
            10
          )
        )
      : 0
  }

  const sessionUtilization =
    elapsedSeconds > 0 ? round1((speakingTimeSeconds / elapsedSeconds) * 100) : 0

  return {
    speakingTimeSeconds,
    speakingTimeFormatted: formatDuration(speakingTimeSeconds),
    totalWordsSpoken,
    averageAnswerLength,
    fillerWordCount,
    fillerWordsDetected,
    fillerRatePer100Words:
      totalWordsSpoken > 0 ? round1((fillerWordCount / totalWordsSpoken) * 100) : 0,
    confidenceScore,
    communicationScore,
    keywordMatchScore,
    keywordsMatched: [...allMatchedKeywords],
    keywordsTotal,
    substantiveAnswerCount: substantiveAnswers.length,
    questionsAnswered: perAnswer.length,
    sessionDurationSeconds: elapsedSeconds,
    sessionSpeakingUtilizationPercent: sessionUtilization,
    perAnswer,
    generatedAt: new Date().toISOString(),
  }
}

function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}m ${r}s`
}
