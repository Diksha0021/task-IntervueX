import './config/env.js'
import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { connectDB, isMongoConnected } from './config/db.js'
import sessionsRouter from './routes/sessions.js'
import chunksRouter from './routes/chunks.js'
import authRouter from './routes/auth.js'
import reportsRouter from './routes/reports.js'
import candidatesRouter from './routes/candidates.js'
import recordingsRouter from './routes/recordings.js'
import transcriptsRouter from './routes/transcripts.js'
import clientLogsRouter from './routes/clientLogs.js'
import interviewsRouter from './routes/interviews.js'
import { attachProctoringWebSocket } from './websocket/proctoring.js'
import { attachSocketIO } from './websocket/socketServer.js'
import { log } from './utils/logger.js'
import { seedDemoUsers } from './store/userStore.js'
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js'
import { env } from './config/env.js'
import { resolveTranscriptionProvider } from './services/transcription/index.js'

const app = express()
const server = createServer(app)

attachSocketIO(server)

app.use(cors({
  origin: process.env.ALLOWED_ORIGIN ?? true,
  credentials: true,
}))
app.use(express.json({ limit: '2mb' }))

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'intervuex-api',
    ts: Date.now(),
    database: isMongoConnected() ? 'mongodb' : 'file-fallback',
  })
})

app.use('/api/auth', authRouter)
app.use('/api/sessions', sessionsRouter)
app.use('/api/reports', reportsRouter)
app.use('/api/interviews', interviewsRouter)
app.use('/api/chunks', chunksRouter)
app.use('/api/candidates', candidatesRouter)
app.use('/api/recordings', recordingsRouter)
app.use('/api/transcripts', transcriptsRouter)
app.use('/api/logs', clientLogsRouter)

app.use(notFoundHandler)
app.use(errorHandler)

async function startServer() {
  await seedDemoUsers()

 const host = process.env.HOST ?? '0.0.0.0'

  await new Promise((resolve, reject) => {
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        log('error', `Port ${env.port} is already in use`, {
          hint: `Stop the other process or set PORT=${env.port + 1} in server/.env`,
        })
      }
      reject(err)
    })

    server.listen(env.port, host, () => {
      server.removeListener('error', reject)
      resolve()
    })
  })

  attachProctoringWebSocket(server)

  log('info', `Server listening on http://${host}:${env.port}`)
  log('info', `Recording storage: ${env.storageProvider}${env.s3.bucket ? ` (bucket: ${env.s3.bucket})` : ''}`)
  log('info', `Transcription provider: ${resolveTranscriptionProvider()}`)
  log('info', `WebSocket: ws://${host}:${env.port}/ws/proctoring?sessionId=<id>`)
  log('info', `Socket.IO: http://${host}:${env.port}/socket.io`)
  log('info', 'Demo accounts: recruiter@demo.com / candidate@demo.com (password: demo1234)')

  connectDB()
    .then(() => {
      log('info', `Database: ${isMongoConnected() ? 'MongoDB' : 'JSON file fallback'}`)
    })
    .catch((err) => {
      log('warn', 'MongoDB unavailable — using JSON file fallback', { error: err.message })
    })
}

startServer().catch((err) => {
  log('error', 'Failed to start server', { error: err.message })
  process.exit(1)
})
