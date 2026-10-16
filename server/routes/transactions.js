import express from 'express'
import Transaction from '../models/Transaction.js'

const router = express.Router()

function requestUserId(req, res) {
  const userId = req.query.userId || req.body?.userId
  if (!userId || typeof userId !== 'string') {
    res.status(400).json({ message: 'userId is required' })
    return null
  }
  return userId
}

router.get('/', async (req, res, next) => {
  try {
    console.log('1 route entered')
    console.log('mongoose readyState', Transaction.db.readyState)
    const userId = requestUserId(req, res)
    if (!userId) return
    console.log('2 userId', userId)
    console.log('3 before Transaction.find')
    const transactions = await Transaction.find({ userId }).sort({ date: -1, createdAt: -1 })
    console.log('4 after Transaction.find', transactions.length)
    console.log('5 before response')
    res.json(transactions)
    console.log('6 response sent')
  } catch (error) {
    next(error)
  }
})

router.post('/', async (req, res, next) => {
  try {
    const userId = requestUserId(req, res)
    if (!userId) return
    const { amount, category, description, date } = req.body
    const transaction = await Transaction.create({ userId, amount, category, description, date })
    res.status(201).json(transaction)
  } catch (error) {
    next(error)
  }
})

router.patch('/:id', async (req, res, next) => {
  try {
    const userId = requestUserId(req, res)
    if (!userId) return
    const { amount, category, description, date } = req.body
    const transaction = await Transaction.findOneAndUpdate(
      { _id: req.params.id, userId },
      { $set: { amount, category, description, date } },
      { new: true, runValidators: true },
    )
    if (!transaction) return res.status(404).json({ message: 'Transaction not found' })
    res.json(transaction)
  } catch (error) { next(error) }
})

router.delete('/:id', async (req, res, next) => {
  try {
    const userId = requestUserId(req, res)
    if (!userId) return
    const transaction = await Transaction.findOneAndDelete({ _id: req.params.id, userId })
    if (!transaction) return res.status(404).json({ message: 'Transaction not found' })
    res.status(204).send()
  } catch (error) {
    next(error)
  }
})

export default router
