import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

dotenv.config({ path: join(__dirname, '..', '.env') })

export const env = {
  port: Number(process.env.PORT ?? 5000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  mongodbUri: process.env.MONGODB_URI ?? '',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-interview-secret-change-me',
  /** Public API base used in recording playback URLs (include protocol, no trailing slash). */
  publicApiBaseUrl:
    process.env.PUBLIC_API_URL ??
    process.env.API_BASE_URL ??
    `http://127.0.0.1:${Number(process.env.PORT ?? 5000)}`,
  /** `local` (disk + API stream) or `s3` (AWS S3 / compatible) */
  storageProvider: (process.env.STORAGE_PROVIDER ?? 'local').toLowerCase(),
  s3: {
    bucket: process.env.AWS_S3_BUCKET ?? process.env.S3_BUCKET ?? '',
    region: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
    endpoint: process.env.AWS_S3_ENDPOINT ?? '',
    forcePathStyle: process.env.AWS_S3_FORCE_PATH_STYLE === 'true',
    signedUrlTtlSeconds: Number(process.env.AWS_S3_SIGNED_URL_TTL ?? 3600),
  },
  transcription: {
    /** auto | whisper | deepgram | mock */
    provider: (process.env.TRANSCRIPTION_PROVIDER ?? 'auto').toLowerCase(),
    openaiApiKey: process.env.OPENAI_API_KEY ?? '',
    openaiBaseUrl: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
    whisperModel: process.env.WHISPER_MODEL ?? 'whisper-1',
    deepgramApiKey: process.env.DEEPGRAM_API_KEY ?? '',
    maxAttempts: Number(process.env.TRANSCRIPTION_MAX_ATTEMPTS ?? 3),
    retryBaseDelayMs: Number(process.env.TRANSCRIPTION_RETRY_BASE_MS ?? 2000),
    retryMaxDelayMs: Number(process.env.TRANSCRIPTION_RETRY_MAX_MS ?? 16000),
  },
}

export function requireMongoUri() {
  if (!env.mongodbUri) {
    throw new Error('MONGODB_URI is not configured. Copy server/.env.example to server/.env')
  }
  return env.mongodbUri
}
