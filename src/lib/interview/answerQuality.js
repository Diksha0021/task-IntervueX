const NO_ANSWER_PATTERNS = [
  '(no verbal response',
  'no verbal response recorded',
  'no answer',
  'skipped',
  'n/a',
  'none provided',
]

/** True only when the candidate gave a real spoken/written answer. */
export function isSubstantiveAnswer(text) {
  const raw = (text ?? '').trim()
  if (!raw) return false

  const lower = raw.toLowerCase()
  if (NO_ANSWER_PATTERNS.some((p) => lower.includes(p))) return false

  const words = raw.split(/\s+/).filter(Boolean)
  if (words.length < 5) return false
  if (raw.length < 20) return false

  return true
}

export function scoreSingleAnswer(answer, keywords = []) {
  if (!isSubstantiveAnswer(answer)) {
    return {
      substantive: false,
      communication: 0,
      technical: 0,
      wordCount: 0,
      keywordHits: 0,
    }
  }

  const words = answer.split(/\s+/).filter(Boolean)
  const wordCount = words.length
  const lower = answer.toLowerCase()

  const keywordHits = keywords.filter((k) => lower.includes(k.toLowerCase())).length

  const communication = Math.min(10, Math.round(Math.min(wordCount, 100) / 10))
  const technical = Math.min(
    10,
    Math.round(keywordHits * 1.5 + Math.min(wordCount / 20, 3))
  )

  return {
    substantive: true,
    communication,
    technical,
    wordCount,
    keywordHits,
  }
}
