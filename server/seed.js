import 'dotenv/config'
import { connectDatabase, disconnectDatabase } from './config/db.js'
import Budget from './models/Budget.js'
import Transaction from './models/Transaction.js'
import User from './models/User.js'
import SavingsBuddy from './models/SavingsBuddy.js'
import CommunityPost from './models/CommunityPost.js'
import FriendRequest from './models/FriendRequest.js'
import Achievement from './models/Achievement.js'
import StreakNotification from './models/StreakNotification.js'

const today = new Date()
const dateInput = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const addDays = days => {
  const date = new Date(today)
  date.setDate(date.getDate() + days)
  return dateInput(date)
}

const users = [
  { userId: 'user_alex', username: 'alex', displayName: 'Alex', profileType: 'fresh', currentStreak: 0, lastResultDate: '' },
  { userId: 'user_chloe', username: 'chloe', displayName: 'Chloe', profileType: 'seeded', currentStreak: 5, lastResultDate: '' },
  { userId: 'user_sarah', username: 'sarah', displayName: 'Sarah', profileType: 'seeded', currentStreak: 8, lastResultDate: '' },
]

const roundMoney = value => Math.round(value * 100) / 100
const makeTransaction = (userId, date, amount, category, description) => ({ userId, date, amount: roundMoney(amount), category, description })

function chloeTransactions() {
  const coffeeAmounts = [4.2, 3.75, 5.1, 4.6, 6.25, 3.5, 4.85, 5.4, 4.1, 6.8]
  const daily = coffeeAmounts.map((amount, index) => ({
    userId: 'user_chloe',
    date: addDays(-29 + index),
    amount,
    category: 'Food & Drink',
    description: index % 3 === 0 ? 'Morning coffee' : index % 3 === 1 ? 'Quick lunch' : 'Snack on the go',
  }))
  const repeatedDaily = Array.from({ length: 30 }, (_, index) => ({
    ...daily[index % daily.length],
    date: addDays(-29 + index),
    amount: coffeeAmounts[index % coffeeAmounts.length],
  }))
  const extras = [
    [-27, 6.4, 'Food & Drink', 'Afternoon pastry'],
    [-25, 8.75, 'Transport', 'Bus top-up'],
    [-22, 18.5, 'Groceries', 'Fresh fruit and milk'],
    [-19, 24.9, 'Shopping', 'Notebook and pens'],
    [-17, 7.2, 'Food & Drink', 'Tea with a friend'],
    [-14, 13.5, 'Entertainment', 'Movie ticket'],
    [-12, 5.8, 'Other', 'Pharmacy essentials'],
    [-10, 31.4, 'Groceries', 'Weekly groceries'],
    [-8, 9.2, 'Transport', 'Train fare'],
    [-5, 16.75, 'Shopping', 'Household supplies'],
    [-3, 6.5, 'Entertainment', 'Streaming rental'],
    [0, 7.9, 'Food & Drink', 'Weekend breakfast'],
  ].map(([offset, amount, category, description]) => makeTransaction('user_chloe', addDays(offset), amount, category, description))
  return [...repeatedDaily, ...extras]
}

function sarahTransactions() {
  const transactions = []
  const categoryCycle = ['Food & Drink', 'Food & Drink', 'Transport', 'Groceries', 'Other']
  for (let offset = -59; offset <= 0; offset += 1) {
    const date = new Date(today)
    date.setDate(date.getDate() + offset)
    const day = date.getDay()
    const recent = offset >= -29
    const periodFactor = recent ? 0.92 : 1.08
    const category = categoryCycle[(offset + 59) % categoryCycle.length]
    const baseAmount = category === 'Food & Drink'
      ? 8.2 + ((offset + 59) % 4) * 1.35
      : category === 'Transport'
        ? 6.5 + ((offset + 59) % 3) * 1.1
        : category === 'Groceries'
          ? 19 + ((offset + 59) % 4) * 2.5
          : 5.5 + ((offset + 59) % 3) * 1.25
    transactions.push(makeTransaction('user_sarah', dateInput(date), baseAmount * periodFactor, category, category === 'Food & Drink' ? 'Coffee or lunch' : `${category} essentials`))

    if (day === 0 || day === 6) {
      const weekendCategory = day === 6 || (offset + 59) % 3 === 0 ? 'Entertainment' : 'Shopping'
      const weekendAmount = weekendCategory === 'Entertainment' ? 24 + ((offset + 59) % 4) * 4 : 28 + ((offset + 59) % 3) * 6
      transactions.push(makeTransaction('user_sarah', dateInput(date), weekendAmount * periodFactor, weekendCategory, day === 6 ? 'Weekend plans' : 'Weekend outing'))
    }
  }

  const largerPurchases = [
    [-52, 145, 'Shopping', 'Winter coat'],
    [-43, 82, 'Entertainment', 'Concert tickets'],
    [-34, 118, 'Shopping', 'Home equipment'],
    [-18, 72, 'Entertainment', 'Festival pass'],
    [-7, 96, 'Shopping', 'Quality shoes'],
  ]
  largerPurchases.forEach(([offset, amount, category, description]) => {
    const date = new Date(today)
    date.setDate(date.getDate() + offset)
    const periodFactor = offset >= -29 ? 0.92 : 1.08
    transactions.push(makeTransaction('user_sarah', dateInput(date), amount * periodFactor, category, description))
  })
  return transactions
}

try {
  await connectDatabase()
  await User.deleteMany({})
  await SavingsBuddy.deleteMany({})
  await CommunityPost.deleteMany({})
  await FriendRequest.deleteMany({})
  await Achievement.deleteMany({})
  await StreakNotification.deleteMany({})
  await Budget.deleteMany({})
  await Transaction.deleteMany({})
  await User.insertMany(users)
  await FriendRequest.create({ fromUserId: 'user_chloe', toUserId: 'user_sarah', status: 'accepted' })
  await SavingsBuddy.create({ userIds: ['user_chloe', 'user_sarah'], sharedStreak: 4, status: 'active', invitedBy: 'user_chloe' })
  await Budget.insertMany([
    { userId: 'user_chloe', monthlyBudget: 900, protectedSavings: 160, startDate: addDays(-15), endDate: addDays(15), configured: true },
    { userId: 'user_sarah', monthlyBudget: 1200, protectedSavings: 250, startDate: addDays(-15), endDate: addDays(15), configured: true },
  ])
  const chloeSeed = chloeTransactions()
  const sarahSeed = sarahTransactions()
  const seededTransactions = [...chloeSeed, ...sarahSeed]
  await Transaction.insertMany(seededTransactions)
  console.log(`Seeded ${users.length} users, ${chloeSeed.length} Chloe transactions, ${sarahSeed.length} Sarah transactions, and two budgets`)
} catch (error) {
  console.error(`Seed failed: ${error.message}`)
  process.exitCode = 1
} finally {
  await disconnectDatabase()
}
