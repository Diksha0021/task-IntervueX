import { v4 as uuidv4 } from 'uuid'
import InterviewSession from '../models/InterviewSession.js'
import Candidate from '../models/Candidate.js'

function toIso(value) {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : value
}

/** Map MongoDB document → legacy API shape consumed by routes / websocket / frontend */
export function toLegacySession(doc) {
  if (!doc) return null

  const raw = doc.toObject ? doc.toObject() : doc
  const sessionData = {
    ...(raw.session_data ?? {}),
    status: raw.status ?? raw.session_data?.status ?? 'active',
    transcription: raw.transcript ?? raw.session_data?.transcription ?? null,
    flags: raw.suspiciousFlags?.length
      ? raw.suspiciousFlags
      : raw.session_data?.flags ?? [],
    chunkCount: raw.chunkCount ?? raw.session_data?.chunkCount ?? 0,
    recordingUrl: raw.recordingUrl ?? raw.session_data?.recordingUrl ?? null,
    recordingStorageKey:
      raw.recordingStorageKey ?? raw.session_data?.recordingStorageKey ?? null,
    mergeStatus: raw.session_data?.mergeStatus ?? 'pending',
    transcriptionStatus: raw.session_data?.transcriptionStatus ?? 'pending',
    serverTranscript:
      raw.session_data?.serverTranscript ?? raw.transcript ?? raw.session_data?.transcription ?? null,
    transcriptionProvider: raw.session_data?.transcriptionProvider ?? null,
  }

  return {
    id: raw.sessionId,
    userId: raw.userId ?? null,
    userEmail: raw.userEmail ?? null,
    candidateName: raw.candidateName ?? null,
    createdAt: toIso(raw.createdAt),
    updatedAt: toIso(raw.updatedAt),
    startedAt: toIso(raw.startedAt),
    completedAt: toIso(raw.completedAt),
    session_data: sessionData,
  }
}

function deriveCandidateName(meta = {}) {
  if (meta.candidateName) return meta.candidateName
  if (meta.userEmail) return meta.userEmail.split('@')[0]
  return 'Candidate'
}

function syncTopLevelFromPatch(doc, patch) {
  if (patch.status) {
    doc.status = patch.status
    if (patch.status === 'completed' && !doc.completedAt) {
      doc.completedAt = patch.completedAt ? new Date(patch.completedAt) : new Date()
    }
  }

  if (patch.transcription !== undefined) {
    doc.transcript = patch.transcription ?? ''
  }

  if (Array.isArray(patch.flags)) {
    doc.suspiciousFlags = patch.flags
  }

  if (typeof patch.chunkCount === 'number') {
    doc.chunkCount = patch.chunkCount
  }

  if (patch.recordingUrl !== undefined) {
    doc.recordingUrl = patch.recordingUrl
  }

  if (patch.recordingStorageKey !== undefined) {
    doc.recordingStorageKey = patch.recordingStorageKey
  }
}

async function upsertCandidateForSession({ userId, userEmail, candidateName, sessionId }) {
  if (!userId || !userEmail) return

  await Candidate.findOneAndUpdate(
    { userId },
    {
      $set: {
        email: userEmail,
        name: candidateName,
        lastInterviewAt: new Date(),
      },
      $addToSet: { sessionIds: sessionId },
      $inc: { totalInterviews: 1 },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  )
}

export async function createMongoSession(initial = {}, meta = {}) {
  const sessionId = uuidv4()
  const candidateName = deriveCandidateName(meta)
  const status = initial.status ?? 'active'

  const sessionData = {
    status: 'active',
    questionIndex: 0,
    answers: [],
    tabWarnings: 0,
    faceAbsenceWarnings: 0,
    flags: [],
    chunkSequence: 0,
    uploadedChunkKeys: [],
    uploadedChunkCount: 0,
    mergeStatus: 'pending',
    transcriptionStatus: 'pending',
    transcription: null,
    liveTranscript: '',
    currentQuestion: null,
    readyToFinish: false,
    elapsed: 0,
    lastCheckpointAt: null,
    hardwareCheck: { camera: false, microphone: false },
    ...initial,
  }

  const doc = await InterviewSession.create({
    sessionId,
    candidateName,
    userId: meta.userId ?? null,
    userEmail: meta.userEmail ?? null,
    status,
    startedAt: new Date(),
    suspiciousFlags: initial.flags ?? [],
    transcript: initial.transcription ?? sessionData.transcription ?? '',
    chunkCount: 0,
    chunks: [],
    session_data: sessionData,
  })

  await upsertCandidateForSession({
    userId: meta.userId,
    userEmail: meta.userEmail,
    candidateName,
    sessionId,
  })

  return toLegacySession(doc)
}

export async function getMongoSession(sessionId) {
  const doc = await InterviewSession.findOne({ sessionId })
  return toLegacySession(doc)
}

export async function updateMongoSession(sessionId, patch = {}) {
  const doc = await InterviewSession.findOne({ sessionId })
  if (!doc) return null

  doc.session_data = {
    ...(doc.session_data ?? {}),
    ...patch,
  }

  syncTopLevelFromPatch(doc, patch)
  doc.markModified('session_data')
  await doc.save()

  return toLegacySession(doc)
}

export async function listMongoSessions(filter = {}) {
  const docs = await InterviewSession.find(filter).sort({ createdAt: -1 }).lean()
  return docs.map((doc) => toLegacySession(doc))
}

export async function addChunkMetadata(sessionId, chunkMeta, { duplicate = false } = {}) {
  const doc = await InterviewSession.findOne({ sessionId })
  if (!doc) return null

  const existingIndex = doc.chunks.findIndex((c) => c.chunkIndex === chunkMeta.chunkIndex)

  if (existingIndex >= 0) {
    if (!duplicate) {
      doc.chunks[existingIndex].size = chunkMeta.size
      doc.chunks[existingIndex].timestamp = chunkMeta.timestamp
      doc.chunks[existingIndex].mimeType = chunkMeta.mimeType
      doc.chunks[existingIndex].path = chunkMeta.path
    }
  } else {
    doc.chunks.push(chunkMeta)
    if (!duplicate) {
      doc.chunkCount = (doc.chunkCount ?? 0) + 1
    }
  }

  const uploadedKeys = [
    ...new Set([...(doc.session_data?.uploadedChunkKeys ?? []), chunkMeta.key]),
  ].sort()

  doc.session_data = {
    ...(doc.session_data ?? {}),
    uploadedChunkKeys: uploadedKeys,
    chunkSequence: Math.max(doc.session_data?.chunkSequence ?? 0, chunkMeta.chunkIndex + 1),
    lastChunkAt: chunkMeta.timestamp,
    lastChunkIndex: chunkMeta.chunkIndex,
    chunkCount: doc.chunkCount,
  }

  doc.markModified('session_data')
  doc.markModified('chunks')
  await doc.save()

  return toLegacySession(doc)
}

export async function getCandidateByUserId(userId) {
  return Candidate.findOne({ userId }).lean()
}

export async function listCandidates() {
  return Candidate.find().sort({ updatedAt: -1 }).lean()
}
