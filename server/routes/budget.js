import express from 'express'
import Budget from '../models/Budget.js'
import DailyStreakState from '../models/DailyStreakState.js'

const router = express.Router()

function requestUserId(req, res) {
  const userId = req.query.userId || req.body?.userId
  if (!userId || typeof userId !== 'string') {
    res.status(400).json({ message: 'userId is required' })
    return null
  }
  return userId
}

function budgetResponse(budget, userId) {
  if (!budget) return null
  const value = budget.toObject ? budget.toObject() : budget
  return {
    ...value,
    userId,
    monthlyBudget: value.monthlyBudget ?? value.monthly,
    protectedSavings: value.protectedSavings ?? value.savings,
    startDate: value.startDate ?? value.start,
    endDate: value.endDate ?? value.end,
  }
}

router.get('/', async (req, res, next) => {
  try {
    console.log('1 route entered')
    console.log('mongoose readyState', Budget.db.readyState)
    const userId = requestUserId(req, res)
    if (!userId) return
    console.log('2 userId', userId)
    console.log('3 before Budget.findOne')
    const budget = await Budget.findOne({ userId })
    console.log('4 after Budget.findOne', Boolean(budget))
    console.log('5 before response')
    res.json(budgetResponse(budget, userId))
    console.log('6 response sent')
  } catch (error) {
    next(error)
  }
})

router.put('/', async (req, res, next) => {
  try {
    const userId = requestUserId(req, res)
    if (!userId) return
    const { monthlyBudget, protectedSavings, startDate, endDate, configured = true } = req.body
    if (startDate && endDate && endDate < startDate) return res.status(400).json({ message: 'Budget end date must not be before its start date' })
    const budget = await Budget.findOneAndUpdate(
      { userId },
      {
        $set: { userId, monthlyBudget, protectedSavings, startDate, endDate, configured },
        $unset: { monthly: 1, savings: 1, start: 1, end: 1 },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    )
    await DailyStreakState.updateMany(
      { userId, dayFinalized: false },
      { $set: { dailySafeLimit: null } },
    )
    res.json(budgetResponse(budget, userId))
  } catch (error) {
    next(error)
  }
})

export default router
