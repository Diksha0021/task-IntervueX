import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuidv4 } from 'uuid'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '..', 'data')
const SESSIONS_FILE = join(DATA_DIR, 'sessions.json')

function ensureStore() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
  if (!existsSync(SESSIONS_FILE)) writeFileSync(SESSIONS_FILE, JSON.stringify({}), 'utf8')
}

function readAll() {
  ensureStore()
  return JSON.parse(readFileSync(SESSIONS_FILE, 'utf8'))
}

function writeAll(sessions) {
  ensureStore()
  writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2), 'utf8')
}

export function createFileSession(initial = {}, meta = {}) {
  const id = uuidv4()
  const sessions = readAll()
  sessions[id] = {
    id,
    userId: meta.userId ?? null,
    userEmail: meta.userEmail ?? null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    session_data: {
      status: 'active',
      questionIndex: 0,
      answers: [],
      tabWarnings: 0,
      faceAbsenceWarnings: 0,
      flags: [],
      chunkSequence: 0,
      uploadedChunkKeys: [],
      mergeStatus: 'pending',
      transcriptionStatus: 'pending',
      transcription: null,
      elapsed: 0,
      liveTranscript: '',
      currentQuestion: null,
      readyToFinish: false,
      uploadedChunkCount: 0,
      lastCheckpointAt: null,
      hardwareCheck: { camera: false, microphone: false },
      ...initial,
    },
  }
  writeAll(sessions)
  return sessions[id]
}

export function getFileSession(id) {
  const sessions = readAll()
  return sessions[id] ?? null
}

export function updateFileSession(id, patch) {
  const sessions = readAll()
  const session = sessions[id]
  if (!session) return null

  session.session_data = {
    ...session.session_data,
    ...patch,
  }
  session.updatedAt = new Date().toISOString()
  sessions[id] = session
  writeAll(sessions)
  return session
}

export function listFileSessions() {
  return Object.values(readAll())
}
