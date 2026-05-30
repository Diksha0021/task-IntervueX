/**
 * Fallback transcript built from structured Q&A when no speech API is configured.
 */
export function buildMockTranscript(answers = []) {
  if (!answers.length) return 'No spoken responses captured.'
  return answers
    .map((a, i) => `Q${i + 1}: ${a.question}\nA${i + 1}: ${a.answer}`)
    .join('\n\n')
}

export async function transcribeWithMock({ answers }) {
  return {
    text: buildMockTranscript(answers),
    provider: 'mock',
    language: null,
    segments: null,
  }
}
