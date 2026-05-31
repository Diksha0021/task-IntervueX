import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { randomBytes } from 'crypto'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuidv4 } from 'uuid'
import {
  buildQuestionsFromTopics,
  topicsToKeywords,
} from '../config/interviewTopics.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '..', 'data')
const INTERVIEWS_FILE = join(DATA_DIR, 'customInterviews.json')

function ensureStore() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
  if (!existsSync(INTERVIEWS_FILE)) writeFileSync(INTERVIEWS_FILE, JSON.stringify({}), 'utf8')
}

function readAll() {
  ensureStore()
  return JSON.parse(readFileSync(INTERVIEWS_FILE, 'utf8'))
}

function writeAll(interviews) {
  ensureStore()
  writeFileSync(INTERVIEWS_FILE, JSON.stringify(interviews, null, 2), 'utf8')
}

function generateInviteCode(existing) {
  const codes = new Set(Object.values(existing).map((i) => i.inviteCode))
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = randomBytes(4).toString('hex').toUpperCase()
    if (!codes.has(code)) return code
  }
  return randomBytes(6).toString('hex').toUpperCase()
}

export function listByRecruiter(recruiterId) {
  return Object.values(readAll())
    .filter((i) => i.recruiterId === recruiterId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

export function findById(id) {
  const all = readAll()
  return all[id] ?? null
}

export function findByInviteCode(inviteCode) {
  if (!inviteCode) return null
  const key = inviteCode.trim().toUpperCase()
  return Object.values(readAll()).find((i) => i.inviteCode === key && i.isActive !== false) ?? null
}

export function createCustomInterview(recruiterId, payload) {
  const all = readAll()
  const id = uuidv4()
  const topics = (payload.topics ?? []).filter(Boolean)
  const customQuestions = (payload.customQuestions ?? []).filter(Boolean)
  const questions = buildQuestionsFromTopics(topics, customQuestions)
  const now = new Date().toISOString()

  const interview = {
    id,
    recruiterId,
    title: payload.title?.trim() || 'Custom Interview',
    roleLabel: payload.roleLabel?.trim() || payload.title?.trim() || 'Candidate',
    durationMinutes: Math.min(45, Math.max(10, Number(payload.durationMinutes) || 25)),
    topics,
    keywords: topicsToKeywords(topics),
    questions,
    inviteCode: generateInviteCode(all),
    isActive: true,
    createdAt: now,
    updatedAt: now,
  }

  all[id] = interview
  writeAll(all)
  return interview
}

export function updateCustomInterview(id, recruiterId, patch) {
  const all = readAll()
  const existing = all[id]
  if (!existing || existing.recruiterId !== recruiterId) return null

  const topics = patch.topics ?? existing.topics
  const customQuestions = patch.customQuestions ?? []
  const questions =
    patch.questions ??
    (patch.topics || patch.customQuestions
      ? buildQuestionsFromTopics(topics, customQuestions)
      : existing.questions)

  all[id] = {
    ...existing,
    ...patch,
    topics,
    keywords: topicsToKeywords(topics),
    questions,
    updatedAt: new Date().toISOString(),
  }
  writeAll(all)
  return all[id]
}

export function deleteCustomInterview(id, recruiterId) {
  const all = readAll()
  const existing = all[id]
  if (!existing || existing.recruiterId !== recruiterId) return false
  all[id] = { ...existing, isActive: false, updatedAt: new Date().toISOString() }
  writeAll(all)
  return true
}

export function sanitizeForPublic(interview, recruiterName) {
  if (!interview) return null
  return {
    id: interview.id,
    title: interview.title,
    roleLabel: interview.roleLabel,
    durationMinutes: interview.durationMinutes,
    topics: interview.topics,
    questionCount: interview.questions?.length ?? 0,
    inviteCode: interview.inviteCode,
    recruiterName: recruiterName ?? 'Recruiter',
  }
}

export function toClientProfile(interview) {
  if (!interview) return null
  return {
    id: interview.id,
    customInterviewId: interview.id,
    isCustom: true,
    title: interview.title,
    roleLabel: interview.roleLabel,
    durationMinutes: interview.durationMinutes,
    keywords: interview.keywords ?? [],
    topics: interview.topics ?? [],
    questions: interview.questions ?? [],
    inviteCode: interview.inviteCode,
    recruiterId: interview.recruiterId,
  }
}
