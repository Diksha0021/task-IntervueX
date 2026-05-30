import { AppError } from './errorHandler.js'

export function validateCreateSession(req, _res, next) {
  const { hardwareCheck, interviewProfileId, durationMinutes, questions } = req.body ?? {}

  if (hardwareCheck !== undefined && typeof hardwareCheck !== 'object') {
    return next(new AppError('hardwareCheck must be an object', 400))
  }

  if (interviewProfileId !== undefined && typeof interviewProfileId !== 'string') {
    return next(new AppError('interviewProfileId must be a string', 400))
  }

  if (durationMinutes !== undefined && (typeof durationMinutes !== 'number' || durationMinutes < 1)) {
    return next(new AppError('durationMinutes must be a positive number', 400))
  }

  if (questions !== undefined && !Array.isArray(questions)) {
    return next(new AppError('questions must be an array', 400))
  }

  next()
}

export function validateSessionIdParam(req, _res, next) {
  const id = req.params.id ?? req.params.sessionId
  if (!id || typeof id !== 'string' || id.trim().length < 8) {
    return next(new AppError('Invalid session id', 400))
  }
  next()
}

export function validateUpdateSession(req, _res, next) {
  const body = req.body
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return next(new AppError('Request body must be a JSON object', 400))
  }
  next()
}
