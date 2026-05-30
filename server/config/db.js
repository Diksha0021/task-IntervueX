import mongoose from 'mongoose'
import { env } from './env.js'
import { log } from '../utils/logger.js'

let connected = false

/**
 * Reusable MongoDB connection utility.
 * Safe to call multiple times — reuses an open connection.
 */
export async function connectDB() {
  if (!env.mongodbUri) {
    log('warn', 'MONGODB_URI not set — using file-based session store fallback')
    return false
  }

  if (connected && mongoose.connection.readyState === 1) {
    return true
  }

  mongoose.set('strictQuery', true)

  await mongoose.connect(env.mongodbUri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 3000,
    connectTimeoutMS: 3000,
  })

  connected = true
  log('info', 'MongoDB connected', { database: mongoose.connection.name })
  return true
}

export async function disconnectDB() {
  if (!connected) return
  await mongoose.disconnect()
  connected = false
  log('info', 'MongoDB disconnected')
}

export function isMongoConnected() {
  return connected && mongoose.connection.readyState === 1
}

mongoose.connection.on('error', (err) => {
  log('error', 'MongoDB connection error', { error: err.message })
})

mongoose.connection.on('disconnected', () => {
  connected = false
  log('warn', 'MongoDB disconnected')
})
