import mongoose from 'mongoose'

const budgetSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, default: 'default' },
  monthlyBudget: { type: Number, required: true, min: 0 },
  protectedSavings: { type: Number, required: true, min: 0 },
  startDate: { type: String, required: true },
  endDate: { type: String, required: true },
  configured: { type: Boolean, default: true },
}, { timestamps: true })

export default mongoose.model('Budget', budgetSchema)
