import mongoose from 'mongoose'

const communityPostSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  type: { type: String, enum: ['win'], default: 'win', required: true },
  text: { type: String, required: true, trim: true, maxlength: 280 },
}, { timestamps: true })

export default mongoose.model('CommunityPost', communityPostSchema)
