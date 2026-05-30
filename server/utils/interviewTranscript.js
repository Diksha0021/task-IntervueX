/**
 * Build a rolling interview transcript from completed Q&A and in-progress speech.
 */
export function buildInterviewTranscript({
  answers = [],
  liveTranscript = '',
  partialQuestion = null,
} = {}) {
  const parts = []

  answers.forEach((item, i) => {
    const q = item?.question ?? `Question ${i + 1}`
    const a = item?.answer ?? '(No verbal response recorded)'
    parts.push(`Q${i + 1}: ${q}\nA${i + 1}: ${a}`)
  })

  const live = `${liveTranscript ?? ''}`.trim()
  if (live && partialQuestion) {
    parts.push(`Q${answers.length + 1}: ${partialQuestion}\nA${answers.length + 1}: ${live} [in progress]`)
  } else if (live) {
    parts.push(`[In progress] ${live}`)
  }

  return parts.join('\n\n').trim()
}
