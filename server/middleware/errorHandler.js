import { log } from '../utils/logger.js'

export class AppError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message)
    this.statusCode = statusCode
    this.details = details
    this.name = 'AppError'
  }
}

export function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Not found', path: req.originalUrl })
}

export function errorHandler(err, req, res, _next) {
  const statusCode = err.statusCode ?? err.status ?? 500
  const requestId = req.headers['x-request-id'] ?? req.id

  const meta = {
    path: req.originalUrl,
    method: req.method,
    requestId,
    code: err.code,
    sessionId: req.params?.sessionId ?? req.body?.sessionId,
  }

  if (statusCode >= 500) {
    log('error', err.message, { ...meta, stack: err.stack })
  } else {
    log('warn', err.message, meta)
  }

  const payload = {
    error: err.message ?? 'Internal server error',
  }

  if (err.details?.reason) payload.reason = err.details.reason
  if (err.name === 'ValidationError') {
    payload.error = 'Validation failed'
    payload.details = Object.values(err.errors ?? {}).map((e) => e.message)
  }

  res.status(statusCode).json(payload)
}
