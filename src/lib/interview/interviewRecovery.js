import { buildInterviewTranscript } from './transcriptBuilder.js'

/**
 * Next question index = count of completed answers (continue after last finished question).
 */
export function resolveQuestionIndex(sessionData = {}, progress = null) {
  const answers = progress?.answers ?? sessionData.answers ?? []
  const totalQuestions = sessionData.questions?.length ?? null
  const fromAnswers = answers.length
  const fromServer = Number.isFinite(sessionData.questionIndex)
    ? sessionData.questionIndex
    : fromAnswers
  const fromProgress = Number.isFinite(progress?.questionIndex)
    ? progress.questionIndex
    : fromAnswers

  let index = Math.max(fromAnswers, fromServer, fromProgress)

  if (sessionData.readyToFinish) {
    index = Math.max(index, fromAnswers)
  }

  if (totalQuestions != null) {
    index = Math.min(index, Math.max(0, totalQuestions - 1))
    if (sessionData.readyToFinish && fromAnswers >= totalQuestions) {
      index = totalQuestions - 1
    }
  }

  return index
}

export function buildCheckpointPatch({
  questionIndex,
  answers,
  elapsed,
  readyToFinish,
  liveTranscript,
  currentQuestion,
  interviewProfileId,
  questions,
  uploadedChunkCount,
  chunkUploadedKeys,
  tabWarnings,
  faceAbsenceWarnings,
  proctoringLog,
  flags,
}) {
  const patch = {}

  if (questionIndex != null) patch.questionIndex = questionIndex
  if (Array.isArray(questions)) patch.questions = questions
  if (Array.isArray(answers)) patch.answers = answers
  if (elapsed != null) patch.elapsed = elapsed
  if (readyToFinish != null) patch.readyToFinish = readyToFinish
  if (liveTranscript != null) patch.liveTranscript = liveTranscript
  if (currentQuestion != null) patch.currentQuestion = currentQuestion
  if (interviewProfileId != null) patch.interviewProfileId = interviewProfileId
  if (uploadedChunkCount != null) patch.uploadedChunkCount = uploadedChunkCount
  if (Array.isArray(chunkUploadedKeys)) patch.chunkUploadedKeys = chunkUploadedKeys
  if (tabWarnings != null) patch.tabWarnings = tabWarnings
  if (faceAbsenceWarnings != null) patch.faceAbsenceWarnings = faceAbsenceWarnings
  if (Array.isArray(proctoringLog)) patch.proctoringLog = proctoringLog
  if (Array.isArray(flags)) patch.flags = flags

  if (Array.isArray(answers) || liveTranscript != null) {
    patch.transcription = buildInterviewTranscript({
      answers: answers ?? [],
      liveTranscript: liveTranscript ?? '',
      partialQuestion: currentQuestion ?? null,
    })
  }

  patch.lastCheckpointAt = new Date().toISOString()
  return patch
}

export function mergeSessionWithProgress(serverSession, progress) {
  if (!serverSession) return null
  if (!progress || progress.sessionId !== serverSession.id) {
    return serverSession
  }

  const sd = serverSession.session_data ?? {}
  const localUpdated = progress.updatedAt ? new Date(progress.updatedAt).getTime() : 0
  const serverUpdated = serverSession.updatedAt
    ? new Date(serverSession.updatedAt).getTime()
    : 0
  const preferLocal = localUpdated >= serverUpdated

  const mergedAnswers =
    preferLocal && progress.answers?.length
      ? progress.answers
      : sd.answers?.length
        ? sd.answers
        : progress.answers ?? []

  const mergedData = {
    ...sd,
    questionIndex: preferLocal
      ? resolveQuestionIndex({ ...sd, answers: mergedAnswers, readyToFinish: progress.readyToFinish }, progress)
      : resolveQuestionIndex({ ...sd, answers: mergedAnswers }),
    answers: mergedAnswers,
    elapsed: preferLocal ? (progress.elapsed ?? sd.elapsed ?? 0) : (sd.elapsed ?? progress.elapsed ?? 0),
    readyToFinish: preferLocal
      ? (progress.readyToFinish ?? sd.readyToFinish ?? false)
      : (sd.readyToFinish ?? progress.readyToFinish ?? false),
    liveTranscript: preferLocal
      ? (progress.liveTranscript ?? sd.liveTranscript ?? '')
      : (sd.liveTranscript ?? progress.liveTranscript ?? ''),
    currentQuestion: preferLocal
      ? (progress.currentQuestion ?? sd.currentQuestion)
      : (sd.currentQuestion ?? progress.currentQuestion),
    interviewProfileId: sd.interviewProfileId ?? progress.interviewProfileId,
    questions:
      preferLocal && progress.questions?.length
        ? progress.questions
        : sd.questions?.length
          ? sd.questions
          : progress.questions ?? [],
    uploadedChunkCount: Math.max(
      sd.uploadedChunkCount ?? 0,
      progress.uploadedChunkCount ?? 0,
      sd.uploadedChunkKeys?.length ?? 0
    ),
    uploadedChunkKeys:
      preferLocal && progress.chunkUploadedKeys?.length
        ? progress.chunkUploadedKeys
        : sd.uploadedChunkKeys ?? progress.chunkUploadedKeys ?? [],
  }

  mergedData.transcription =
    buildInterviewTranscript({
      answers: mergedData.answers,
      liveTranscript: mergedData.liveTranscript,
      partialQuestion: mergedData.currentQuestion,
    }) || sd.transcription

  return {
    ...serverSession,
    session_data: mergedData,
  }
}

export function getRecoverySummary(session) {
  const sd = session?.session_data ?? {}
  const answered = sd.answers?.length ?? 0
  const total = sd.questions?.length ?? 6
  const qIndex = resolveQuestionIndex(sd)
  return {
    sessionId: session?.id,
    answered,
    total,
    questionIndex: qIndex,
    elapsed: sd.elapsed ?? 0,
    readyToFinish: !!sd.readyToFinish,
    uploadedChunks: sd.uploadedChunkCount ?? sd.uploadedChunkKeys?.length ?? 0,
  }
}
