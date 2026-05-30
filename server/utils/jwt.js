import { createHmac } from 'crypto'

const SECRET = process.env.JWT_SECRET || 'intervuex-dev-secret-change-in-production'
const TTL_MS = 7 * 24 * 60 * 60 * 1000

export function signToken(payload) {
  const body = { ...payload, exp: Date.now() + TTL_MS }
  const data = Buffer.from(JSON.stringify(body)).toString('base64url')
  const sig = createHmac('sha256', SECRET).update(data).digest('base64url')
  return `${data}.${sig}`
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null
  const [data, sig] = token.split('.')
  if (!data || !sig) return null

  const expected = createHmac('sha256', SECRET).update(data).digest('base64url')
  if (sig !== expected) return null

  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString())
    if (!payload.exp || payload.exp < Date.now()) return null
    return payload
  } catch {
    return null
  }
}
