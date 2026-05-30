import { scrypt, randomBytes, timingSafeEqual } from 'crypto'
import { promisify } from 'util'

const scryptAsync = promisify(scrypt)

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const derived = await scryptAsync(password, salt, 64)
  return `${salt}:${derived.toString('hex')}`
}

export async function verifyPassword(password, stored) {
  const [salt, key] = stored.split(':')
  if (!salt || !key) return false
  const derived = await scryptAsync(password, salt, 64)
  const keyBuf = Buffer.from(key, 'hex')
  return timingSafeEqual(derived, keyBuf)
}
