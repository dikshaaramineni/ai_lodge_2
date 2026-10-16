import mongoose from 'mongoose'

const sharedSnapshotSchema = new mongoose.Schema({
  relationshipId: { type: mongoose.Schema.Types.ObjectId, required: true },
  sharedStreak: { type: Number, default: 0, min: 0 },
  status: { type: String, default: 'active' },
  lastCompletedDate: { type: String, default: '' },
}, { _id: false })

const dailyStreakStateSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  date: { type: String, required: true },
  dailySafeLimit: { type: Number, default: null, min: 0 },
  streakAtStartOfDay: { type: Number, required: true, min: 0 },
  todayStreakBroken: { type: Boolean, default: false },
  dayFinalized: { type: Boolean, default: false },
  personalLossNotified: { type: Boolean, default: false },
  sharedSnapshots: { type: [sharedSnapshotSchema], default: [] },
}, { timestamps: true })

dailyStreakStateSchema.index({ userId: 1, date: 1 }, { unique: true })

export default mongoose.model('DailyStreakState', dailyStreakStateSchema)
