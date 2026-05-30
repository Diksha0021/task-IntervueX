import mongoose from 'mongoose'

const perAnswerSchema = new mongoose.Schema(
  {
    questionIndex: { type: Number, default: 0 },
    question: { type: String, default: '' },
    wordCount: { type: Number, default: 0 },
    substantive: { type: Boolean, default: false },
    fillerWordCount: { type: Number, default: 0 },
    keywordHits: { type: Number, default: 0 },
    keywordsMatched: { type: [String], default: [] },
    estimatedSpeakingSeconds: { type: Number, default: 0 },
  },
  { _id: false }
)

const interviewAnalyticsSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    speakingTimeSeconds: { type: Number, default: 0 },
    speakingTimeFormatted: { type: String, default: '0m 0s' },
    totalWordsSpoken: { type: Number, default: 0 },
    averageAnswerLength: { type: Number, default: 0 },
    fillerWordCount: { type: Number, default: 0 },
    fillerWordsDetected: {
      type: [{ word: String, count: Number }],
      default: [],
    },
    fillerRatePer100Words: { type: Number, default: 0 },
    confidenceScore: { type: Number, default: 0, min: 0, max: 10 },
    communicationScore: { type: Number, default: 0, min: 0, max: 10 },
    keywordMatchScore: { type: Number, default: 0, min: 0, max: 100 },
    keywordsMatched: { type: [String], default: [] },
    keywordsTotal: { type: Number, default: 0 },
    substantiveAnswerCount: { type: Number, default: 0 },
    questionsAnswered: { type: Number, default: 0 },
    sessionDurationSeconds: { type: Number, default: 0 },
    sessionSpeakingUtilizationPercent: { type: Number, default: 0 },
    perAnswer: { type: [perAnswerSchema], default: [] },
    generatedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    collection: 'interview_analytics',
  }
)

export default mongoose.models.InterviewAnalytics ??
  mongoose.model('InterviewAnalytics', interviewAnalyticsSchema)
