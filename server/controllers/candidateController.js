import { listCandidates, getCandidateByUserId } from '../services/sessionService.js'
import { isMongoConnected } from '../config/db.js'
import { AppError } from '../middleware/errorHandler.js'

export async function listAllCandidates(_req, res) {
  if (!isMongoConnected()) {
    return res.json({ candidates: [], source: 'file-store' })
  }

  const candidates = await listCandidates()
  res.json({ candidates, count: candidates.length })
}

export async function getCandidate(req, res) {
  if (!isMongoConnected()) {
    throw new AppError('Candidate API requires MongoDB', 503)
  }

  const candidate = await getCandidateByUserId(req.params.userId)
  if (!candidate) throw new AppError('Candidate not found', 404)
  res.json({ candidate })
}
