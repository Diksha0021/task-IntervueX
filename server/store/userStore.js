import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuidv4 } from 'uuid'
import { hashPassword } from '../utils/password.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '..', 'data')
const USERS_FILE = join(DATA_DIR, 'users.json')

function ensureStore() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
  if (!existsSync(USERS_FILE)) writeFileSync(USERS_FILE, JSON.stringify({}), 'utf8')
}

function readAll() {
  ensureStore()
  return JSON.parse(readFileSync(USERS_FILE, 'utf8'))
}

function writeAll(users) {
  ensureStore()
  writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8')
}

export function findByEmail(email) {
  const users = readAll()
  const key = email.toLowerCase().trim()
  return users[key] ?? null
}

export function findById(id) {
  const users = readAll()
  return Object.values(users).find((u) => u.id === id) ?? null
}

export function createUser({ email, password, role, name }) {
  const users = readAll()
  const key = email.toLowerCase().trim()

  if (users[key]) {
    const err = new Error('Email already registered')
    err.code = 'EMAIL_EXISTS'
    throw err
  }

  if (!['candidate', 'recruiter'].includes(role)) {
    const err = new Error('Invalid role')
    err.code = 'INVALID_ROLE'
    throw err
  }

  const user = {
    id: uuidv4(),
    email: key,
    passwordHash: null,
    role,
    name: name?.trim() || key.split('@')[0],
    createdAt: new Date().toISOString(),
  }

  return hashPassword(password).then((passwordHash) => {
    user.passwordHash = passwordHash
    users[key] = user
    writeAll(users)
    return sanitize(user)
  })
}

export function sanitize(user) {
  if (!user) return null
  const { passwordHash, ...safe } = user
  return safe
}

export async function seedDemoUsers() {
  const users = readAll()
  if (Object.keys(users).length > 0) return

  await createUser({
    email: 'recruiter@demo.com',
    password: 'demo1234',
    role: 'recruiter',
    name: 'Demo Recruiter',
  })
  await createUser({
    email: 'candidate@demo.com',
    password: 'demo1234',
    role: 'candidate',
    name: 'Demo Candidate',
  })
}
