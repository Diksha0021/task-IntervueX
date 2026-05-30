import mongoose from 'mongoose'

const interviewTranscriptSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    text: {
      type: String,
      default: '',
    },
    provider: {
      type: String,
      default: 'mock',
    },
    language: {
      type: String,
      default: null,
    },
    durationMs: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'done', 'failed'],
      default: 'pending',
    },
    error: {
      type: String,
      default: null,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    segments: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'interview_transcripts',
  }
)

export default mongoose.models.InterviewTranscript ??
  mongoose.model('InterviewTranscript', interviewTranscriptSchema)
