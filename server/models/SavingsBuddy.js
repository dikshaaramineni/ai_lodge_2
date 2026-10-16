import mongoose from 'mongoose'

const completionSchema = new mongoose.Schema({
  date: { type: String, required: true },
  userId: { type: String, required: true },
  success: { type: Boolean, required: true },
}, { _id: false })

const savingsBuddySchema = new mongoose.Schema({
  // One document represents one independent two-person shared streak.
  userIds: { type: [String], required: true, validate: value => value.length === 2 },
  sharedStreak: { type: Number, default: 0, min: 0 },
  lastCompletedDate: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'active', 'broken'], default: 'active' },
  invitedBy: { type: String, default: '' },
  dailyCompletions: { type: [completionSchema], default: [] },
}, { timestamps: true })

savingsBuddySchema.index({ userIds: 1 })

export default mongoose.model('SavingsBuddy', savingsBuddySchema)
