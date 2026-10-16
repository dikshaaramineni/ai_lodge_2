import mongoose from 'mongoose'

const transactionSchema = new mongoose.Schema({
  userId: { type: String, required: true, default: 'default', index: true },
  amount: { type: Number, required: true, min: 0.01 },
  category: { type: String, required: true, trim: true, minlength: 1 },
  description: { type: String, trim: true, default: 'Everyday spend' },
  date: { type: String, required: true },
}, { timestamps: true })

transactionSchema.index({ userId: 1, date: -1 })

export default mongoose.model('Transaction', transactionSchema)
