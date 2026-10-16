import mongoose from 'mongoose'

const streakNotificationSchema = new mongoose.Schema({
  recipientUserId: { type: String, required: true, index: true },
  userId: { type: String, default: '' },
  buddyUserId: { type: String, default: '' },
  key: { type: String, required: true },
  type: { type: String, enum: ['shared-streak-increment', 'shared-streak-milestone', 'shared-streak-broken'], required: true },
  sharedStreak: { type: Number, default: 0, min: 0 },
  resultDate: { type: String, required: true },
  message: { type: String, required: true },
  seen: { type: Boolean, default: false },
}, { timestamps: true })

streakNotificationSchema.index({ recipientUserId: 1, buddyUserId: 1, resultDate: 1, type: 1 }, { unique: true })

export default mongoose.model('StreakNotification', streakNotificationSchema)
