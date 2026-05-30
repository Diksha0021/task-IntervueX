import mongoose from 'mongoose'

const candidateSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    role: {
      type: String,
      default: 'candidate',
      enum: ['candidate'],
    },
    sessionIds: {
      type: [String],
      default: [],
      index: true,
    },
    totalInterviews: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastInterviewAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'candidates',
  }
)

export default mongoose.models.Candidate ?? mongoose.model('Candidate', candidateSchema)
