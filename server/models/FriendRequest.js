import mongoose from 'mongoose'

const friendRequestSchema = new mongoose.Schema({
  fromUserId: { type: String, required: true },
  toUserId: { type: String, required: true },
  status: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending' },
}, { timestamps: true })

friendRequestSchema.index({ fromUserId: 1, toUserId: 1 }, { unique: true })

export default mongoose.model('FriendRequest', friendRequestSchema)
