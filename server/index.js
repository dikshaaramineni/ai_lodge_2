import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import mongoose from 'mongoose'
import { connectDatabase } from './config/db.js'
import budgetRoutes from './routes/budget.js'
import transactionRoutes from './routes/transactions.js'
import streakRoutes from './routes/streaks.js'
import communityRoutes from './routes/community.js'

const app = express()
const PORT = Number(process.env.PORT) || 3000
const HOST = '0.0.0.0'
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  process.env.FRONTEND_URL,
].filter(Boolean)

app.use(cors({ origin: allowedOrigins }))
app.use(express.json())

app.get('/api/health', (req, res) => res.json({ status: 'ok' }))
app.use('/api/transactions', transactionRoutes)
app.use('/api/budget', budgetRoutes)
app.use('/api/streaks', streakRoutes)
app.use('/api/community', communityRoutes)

app.use((error, req, res, next) => {
  if (error instanceof mongoose.Error.ValidationError) {
    return res.status(400).json({ message: error.message })
  }
  if (error instanceof mongoose.Error.CastError) {
    return res.status(400).json({ message: 'Invalid resource id' })
  }
  console.error(error)
  res.status(500).json({ message: 'Internal server error' })
})

try {
  await connectDatabase()
  app.listen(PORT, HOST, () => {
    console.log(`CashLing API listening on port ${PORT}`)
  })
} catch (error) {
  console.error(`Unable to start server: ${error.message}`)
  process.exitCode = 1
}
