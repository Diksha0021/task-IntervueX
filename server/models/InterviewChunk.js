import mongoose from 'mongoose'

const interviewChunkSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    chunkId: {
      type: String,
      required: true,
      trim: true,
    },
    sequenceNumber: {
      type: Number,
      required: true,
      min: 0,
    },
    timestamp: {
      type: Date,
      required: true,
    },
    storageKey: {
      type: String,
      required: true,
    },
    storagePath: {
      type: String,
      required: true,
    },
    cloudStorageKey: {
      type: String,
      default: '',
    },
    size: {
      type: Number,
      default: 0,
      min: 0,
    },
    mimeType: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
    collection: 'interview_chunks',
  }
)

/** One chunkId per session — idempotent uploads */
interviewChunkSchema.index({ sessionId: 1, chunkId: 1 }, { unique: true })
interviewChunkSchema.index({ sessionId: 1, sequenceNumber: 1 })

export default mongoose.models.InterviewChunk ??
  mongoose.model('InterviewChunk', interviewChunkSchema)
