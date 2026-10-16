import mongoose from 'mongoose'

const userSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  username: { type: String, required: true, unique: true, trim: true },
  displayName: { type: String, required: true, trim: true },
  profileType: { type: String, required: true, enum: ['fresh', 'seeded'] },
  currentStreak: { type: Number, default: 0, min: 0 },
  lastResultDate: { type: String, default: '' },
}, { timestamps: true })

export default mongoose.model('User', userSchema)
