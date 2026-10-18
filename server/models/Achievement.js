import mongoose from 'mongoose'

const achievementSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  key: { type: String, required: true },
  text: { type: String, required: true },
  type: { type: String, enum: ['personal-streak', 'shared-streak'], required: true },
  buddyUserId: { type: String, default: '' },
  milestone: { type: Number, required: true, min: 1 },
  status: { type: String, enum: ['pending', 'shared', 'private', 'expired', 'revoked'], default: 'pending' },
  earnedDate: { type: String, default: '' },
}, { timestamps: true })

achievementSchema.index({ userId: 1, key: 1 }, { unique: true })

export default mongoose.model('Achievement', achievementSchema)
