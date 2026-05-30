import mongoose from 'mongoose'

const chunkMetadataSchema = new mongoose.Schema(
  {
    chunkIndex: { type: Number, required: true },
    key: { type: String, required: true },
    path: { type: String, required: true },
    size: { type: Number, default: 0 },
    mimeType: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
)

const interviewSessionSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    candidateName: {
      type: String,
      trim: true,
      default: 'Candidate',
    },
    userId: { type: String, index: true, default: null },
    userEmail: { type: String, trim: true, default: null },
    status: {
      type: String,
      enum: ['active', 'processing', 'completed', 'failed'],
      default: 'active',
      index: true,
    },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
    suspiciousFlags: { type: [String], default: [] },
    transcript: { type: String, default: '' },
    chunkCount: { type: Number, default: 0, min: 0 },
    chunks: { type: [chunkMetadataSchema], default: [] },
    /** Public or API-relative URL for merged interview recording */
    recordingUrl: { type: String, default: null },
    /** Object key in cloud storage (e.g. recordings/{sessionId}/merged.webm) */
    recordingStorageKey: { type: String, default: null },
    /** Legacy nested payload used by the frontend and websocket layer */
    session_data: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
    collection: 'interview_sessions',
  }
)

interviewSessionSchema.index({ userId: 1, status: 1 })
interviewSessionSchema.index({ 'chunks.chunkIndex': 1 })

export default mongoose.models.InterviewSession ??
  mongoose.model('InterviewSession', interviewSessionSchema)
