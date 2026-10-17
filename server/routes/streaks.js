import express from 'express'
import SavingsBuddy from '../models/SavingsBuddy.js'
import User from '../models/User.js'
import Achievement from '../models/Achievement.js'
import StreakNotification from '../models/StreakNotification.js'
import DailyStreakState from '../models/DailyStreakState.js'
import Transaction from '../models/Transaction.js'
import Budget from '../models/Budget.js'

const router = express.Router()

function requestUserId(req, res) {
  const userId = req.query.userId || req.body?.userId
  if (!userId || typeof userId !== 'string') {
    res.status(400).json({ message: 'userId is required' })
    return null
  }
  return userId
}

function pairKey(userIds) { return [...userIds].sort().join('__') }
function dateInput(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
function addDays(value, amount) { const date = new Date(`${value}T00:00:00`); date.setDate(date.getDate() + amount); return dateInput(date) }

async function expirePendingAchievements(userId, currentDate = dateInput(new Date())) {
  const pending = await Achievement.find({ userId, status: 'pending' })
  await Promise.all(pending.map(achievement => {
    const earnedDate = achievement.earnedDate || dateInput(achievement.createdAt)
    if (!achievement.earnedDate) achievement.earnedDate = earnedDate
    if (currentDate <= addDays(earnedDate, 1)) return achievement.isModified() ? achievement.save() : null
    achievement.status = 'expired'
    return achievement.save()
  }))
}

async function saveSharedNotification(event) {
  console.log('[SHARED EVENT CREATED]', event)
  const savedEvent = await StreakNotification.findOneAndUpdate(
    { recipientUserId: event.recipientUserId, buddyUserId: event.buddyUserId, resultDate: event.resultDate, type: event.type },
    { $setOnInsert: {
      recipientUserId: event.recipientUserId,
      userId: event.recipientUserId,
      buddyUserId: event.buddyUserId,
      key: event.key,
      type: event.type,
      sharedStreak: event.sharedStreak,
      resultDate: event.resultDate,
      message: event.message,
    } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean()
  console.log('[SHARED EVENT SAVED]', savedEvent)
  return savedEvent
}

async function getDailyState(userId, date, user, relationships) {
  let state = await DailyStreakState.findOne({ userId, date })
  if (state) return state
  state = await DailyStreakState.create({
    userId,
    date,
    streakAtStartOfDay: user.currentStreak,
    sharedSnapshots: relationships.filter(item => item.status !== 'pending').map(item => ({
      relationshipId: item._id,
      sharedStreak: item.sharedStreak,
      status: item.status,
      lastCompletedDate: item.lastCompletedDate,
    })),
  })
  return state
}

function sharedLossMessage(name) { return `Your shared streak with ${name || 'your buddy'} ended.` }

router.post('/evaluate', async (req, res, next) => {
  try {
    const userId = requestUserId(req, res)
    if (!userId) return
    const date = req.body.date || dateInput(new Date())
    const user = await User.findOne({ userId })
    if (!user) return res.status(404).json({ message: 'User not found' })
    const relationships = await SavingsBuddy.find({ userIds: userId })
    const state = await getDailyState(userId, date, user, relationships)
    const budget = await Budget.findOne({ userId }).lean()
    const transactions = await Transaction.find({ userId }).select('amount date').lean()
    const todaySpending = transactions.filter(item => item.date === date).reduce((sum, item) => sum + Number(item.amount), 0)
    const totalSpent = transactions
      .filter(item => !budget || (item.date >= budget.startDate && item.date <= budget.endDate))
      .reduce((sum, item) => sum + Number(item.amount), 0)
    const monthlyBudget = Number(budget?.monthlyBudget) || 0
    const protectedSavings = Number(budget?.protectedSavings) || 0
    const spendableBudget = monthlyBudget - protectedSavings
    const financialStatus = totalSpent > monthlyBudget ? 'budget-exceeded' : totalSpent > spendableBudget ? 'savings-breached' : 'on-track'
    const remainingDays = budget?.endDate && budget?.startDate
      ? Math.max(1, Math.ceil((new Date(`${budget.endDate}T00:00:00`) - new Date(`${date}T00:00:00`)) / 86400000) + 1)
      : 1
    const derivedDailySafeLimit = Math.max(spendableBudget - totalSpent, 0) / remainingDays
    if (state.dailySafeLimit === null || state.dailySafeLimit === undefined) {
      state.dailySafeLimit = Math.max(0, derivedDailySafeLimit)
      await state.save()
    }
    const dailySafeLimit = state.dailySafeLimit
    const breached = Number(todaySpending) > Math.max(0, Number(dailySafeLimit)) || financialStatus !== 'on-track'
    const otherIds = relationships.flatMap(item => item.userIds).filter(id => id !== userId)
    const otherUsers = await User.find({ userId: { $in: otherIds } }).select('userId displayName').lean()
    const names = new Map(otherUsers.map(item => [item.userId, item.displayName]))
    const result = { personalBroken: false, personalRestored: false, personalStreakBefore: state.streakAtStartOfDay, sharedBroken: [], sharedRestored: [], currentStreak: user.currentStreak }
    const notifications = []

    if (state.dayFinalized || user.lastResultDate === date) {
      if (!state.dayFinalized) {
        state.dayFinalized = true
        await state.save()
      }
      return res.json({ ok: true, userId, todaySpending, dailySafeLimit, financialStatus, ...result, currentStreak: user.currentStreak, todayStreakBroken: state.todayStreakBroken, restored: false, finalized: true, sharedStreaks: relationships.map(item => ({ buddyUserId: item.userIds.find(id => id !== userId), sharedStreak: item.sharedStreak, status: item.status })), notifications })
    }
    if (breached && !state.todayStreakBroken) {
      state.todayStreakBroken = true
      user.currentStreak = 0
      result.personalBroken = true
      if (!state.personalLossNotified) state.personalLossNotified = true
      for (const relationship of relationships.filter(item => item.status !== 'pending')) {
        const previous = relationship.sharedStreak
        if (previous <= 0 && relationship.status === 'broken') continue
        relationship.sharedStreak = 0
        relationship.status = 'broken'
        relationship.lastCompletedDate = ''
        relationship.dailyCompletions = relationship.dailyCompletions.filter(item => item.date !== date)
        await relationship.save()
        result.sharedBroken.push({ buddyUserId: relationship.userIds.find(id => id !== userId), sharedStreak: 0 })
        if (previous > 0) {
          const key = `shared-streak-broken-${relationship._id}-${date}`
           const relationshipNotifications = await Promise.all(relationship.userIds.map(recipientUserId => saveSharedNotification({
             recipientUserId,
             buddyUserId: recipientUserId === userId ? relationship.userIds.find(id => id !== userId) : userId,
            key,
            type: 'shared-streak-broken',
            sharedStreak: 0,
            resultDate: date,
             message: sharedLossMessage(names.get(recipientUserId === userId ? relationship.userIds.find(id => id !== userId) : userId)),
           })))
           notifications.push(...relationshipNotifications)
         }
      }
      await user.save()
      await state.save()
    } else if (!breached && state.todayStreakBroken) {
      state.todayStreakBroken = false
      user.currentStreak = state.streakAtStartOfDay
      result.personalRestored = true
      for (const snapshot of state.sharedSnapshots) {
        const relationship = relationships.find(item => String(item._id) === String(snapshot.relationshipId))
        if (!relationship) continue
        relationship.sharedStreak = snapshot.sharedStreak
        relationship.status = snapshot.status
        relationship.lastCompletedDate = snapshot.lastCompletedDate
        await relationship.save()
        result.sharedRestored.push({ buddyUserId: relationship.userIds.find(id => id !== userId), sharedStreak: relationship.sharedStreak })
      }
      await user.save()
      await state.save()
    }
    result.currentStreak = user.currentStreak
    res.json({ ok: true, userId, todaySpending, dailySafeLimit, financialStatus, ...result, todayStreakBroken: state.todayStreakBroken, restored: result.personalRestored, sharedStreaks: relationships.map(item => ({ buddyUserId: item.userIds.find(id => id !== userId), sharedStreak: item.sharedStreak, status: item.status })), notifications })
  } catch (error) { next(error) }
})

async function normalizeLegacySharedAchievements(user, relationships) {
  const legacy = await Achievement.find({
    userId: user.userId,
    type: 'shared-streak',
    status: 'pending',
  })
  if (!legacy.length) return
  const buddyIds = relationships.map(relationship => relationship.userIds.find(id => id !== user.userId))
  const buddyUsers = await User.find({ userId: { $in: buddyIds } }).select('userId displayName').lean()
  const names = new Map(buddyUsers.map(buddy => [buddy.userId, buddy.displayName]))
  await Promise.all(legacy.map(achievement => {
    const buddyUserId = achievement.buddyUserId || (relationships.length === 1 ? buddyIds[0] : '')
    if (!buddyUserId) {
      achievement.status = 'expired'
      return achievement.save()
    }
    achievement.buddyUserId = buddyUserId
    achievement.text = `You and ${names.get(buddyUserId) || 'your buddy'} reached a ${achievement.milestone}-day shared streak 🔥`
    return achievement.save()
  }))
}

async function relationshipResponse(user, relationships) {
  const otherIds = relationships.flatMap(relationship => relationship.userIds).filter(id => id !== user.userId)
  const users = await User.find({ userId: { $in: otherIds } }).select('userId displayName').lean()
  const names = new Map(users.map(item => [item.userId, item.displayName]))
  const serialized = relationships.map(relationship => ({
    userIds: relationship.userIds,
    sharedStreak: relationship.sharedStreak,
    lastCompletedDate: relationship.lastCompletedDate,
    status: relationship.status,
    invitedBy: relationship.invitedBy,
    buddyUserId: relationship.userIds.find(id => id !== user.userId),
    buddyName: names.get(relationship.userIds.find(id => id !== user.userId)) || 'Savings Buddy',
  }))
  return { userId: user.userId, currentStreak: user.currentStreak, lastResultDate: user.lastResultDate, relationships: serialized, buddy: serialized[0] || null }
}

async function streakResponse(user, relationships, extra = {}, currentDate) {
  const effectiveCurrentDate = currentDate || dateInput(new Date())
  await expirePendingAchievements(user.userId, effectiveCurrentDate)
  await normalizeLegacySharedAchievements(user, relationships)
  const achievements = (await Achievement.find({ userId: user.userId, status: 'pending' }).sort({ createdAt: 1 }).lean())
    .filter(achievement => achievement.earnedDate === addDays(effectiveCurrentDate, -1))
  return { ...(await relationshipResponse(user, relationships)), achievements, ...extra }
}

router.get('/notifications', async (req, res, next) => {
  try {
    const userId = requestUserId(req, res)
    if (!userId) return
    const notifications = await StreakNotification.find({ recipientUserId: userId, seen: false }).sort({ createdAt: 1 }).lean()
    console.log('[NOTIFICATIONS API FETCH]', { userId, count: notifications.length })
    res.json(notifications)
  } catch (error) {
    next(error)
  }
})

router.patch('/notifications/:notificationId/seen', async (req, res, next) => {
  try {
    const userId = requestUserId(req, res)
    if (!userId) return
    const notification = await StreakNotification.findOneAndUpdate(
      { _id: req.params.notificationId, recipientUserId: userId, seen: false },
      { $set: { seen: true } },
      { new: true },
    ).lean()
    if (!notification) return res.status(404).json({ message: 'Unseen notification not found' })
    res.json(notification)
  } catch (error) {
    next(error)
  }
})

router.get('/', async (req, res, next) => {
  try {
    const userId = requestUserId(req, res)
    if (!userId) return
    const user = await User.findOne({ userId })
    if (!user) return res.status(404).json({ message: 'User not found' })
    const relationships = await SavingsBuddy.find({ userIds: userId }).sort({ createdAt: 1 })
    res.json(await streakResponse(user, relationships, {}, req.query.activeDay || undefined))
  } catch (error) {
    next(error)
  }
})

router.post('/complete', async (req, res, next) => {
  try {
    const userId = requestUserId(req, res)
    if (!userId) return
    const { date, personalDate = date, success } = req.body
    if (!date || typeof success !== 'boolean') return res.status(400).json({ message: 'date and success are required' })

    const user = await User.findOne({ userId })
    if (!user) return res.status(404).json({ message: 'User not found' })
    const relationships = await SavingsBuddy.find({ userIds: userId })
    const dayState = await getDailyState(userId, personalDate, user, relationships)
    const brokenBeforeFinalize = dayState.todayStreakBroken
    const alreadyFinalized = user.lastResultDate === personalDate || dayState.dayFinalized
    const finalizedSuccess = alreadyFinalized ? user.currentStreak > 0 : (dayState.todayStreakBroken ? false : success)
    if (!alreadyFinalized) {
      user.currentStreak = finalizedSuccess ? user.currentStreak + 1 : 0
      user.lastResultDate = personalDate
      await user.save()
      if (finalizedSuccess && user.currentStreak % 5 === 0) {
          await Achievement.updateOne(
          { userId, key: `personal-streak-${user.currentStreak}` },
          { $setOnInsert: { userId, key: `personal-streak-${user.currentStreak}`, type: 'personal-streak', milestone: user.currentStreak, earnedDate: personalDate, text: `You reached a ${user.currentStreak}-day on-track streak 🔥` } },
          { upsert: true },
        )
      }
    }
    dayState.dayFinalized = true
    dayState.todayStreakBroken = !finalizedSuccess
    await dayState.save()

    const otherIds = relationships.flatMap(relationship => relationship.userIds).filter(id => id !== userId)
    const otherUsers = await User.find({ userId: { $in: otherIds } }).select('userId displayName').lean()
    const names = new Map(otherUsers.map(item => [item.userId, item.displayName]))
    names.set(userId, user.displayName)
    const sharedResults = []

    for (const relationship of relationships) {
      if (relationship.status === 'pending') continue
      const buddyUserId = relationship.userIds.find(id => id !== userId)
      const buddyName = names.get(buddyUserId) || 'your buddy'
      const previousStreak = relationship.sharedStreak
      const existingCompletion = relationship.dailyCompletions.find(item => item.date === date && item.userId === userId)
      if (!existingCompletion) relationship.dailyCompletions.push({ date, userId, success: finalizedSuccess })

      let outcome = 'pending'
      if (!finalizedSuccess) {
        relationship.sharedStreak = 0
        relationship.status = 'broken'
        relationship.lastCompletedDate = ''
        relationship.dailyCompletions = relationship.dailyCompletions.filter(item => item.date !== date)
        outcome = previousStreak > 0 ? 'failure' : 'already-broken'
        if (previousStreak > 0) {
          const notificationKey = `shared-streak-broken-${pairKey(relationship.userIds)}-${date}`
          await Promise.all(relationship.userIds.map(sharedUserId => {
            const recipientBuddyId = sharedUserId === userId ? buddyUserId : userId
            return saveSharedNotification({
              recipientUserId: sharedUserId,
              buddyUserId: recipientBuddyId,
              key: notificationKey,
              type: 'shared-streak-broken',
              sharedStreak: 0,
              resultDate: date,
              message: `Your shared streak with ${names.get(recipientBuddyId) || 'your buddy'} ended.`,
            })
          }))
        }
      } else {
        const sameDay = relationship.dailyCompletions.filter(item => item.date === date)
        const bothCompleted = relationship.userIds.every(id => sameDay.some(item => item.userId === id && item.success))
        if (bothCompleted && relationship.lastCompletedDate !== date) {
          relationship.sharedStreak += 1
          relationship.lastCompletedDate = date
          relationship.status = 'active'
          relationship.dailyCompletions = relationship.dailyCompletions.filter(item => item.date !== date)
          outcome = 'success'
          if (relationship.sharedStreak % 5 === 0) {
            await Promise.all(relationship.userIds.map(sharedUserId => Achievement.updateOne(
              { userId: sharedUserId, key: `shared-streak-${pairKey(relationship.userIds)}-${relationship.sharedStreak}` },
              { $setOnInsert: {
                userId: sharedUserId,
                key: `shared-streak-${pairKey(relationship.userIds)}-${relationship.sharedStreak}`,
                type: 'shared-streak',
                buddyUserId: sharedUserId === userId ? buddyUserId : userId,
                milestone: relationship.sharedStreak,
                earnedDate: date,
                 text: `You and ${names.get(sharedUserId === userId ? buddyUserId : userId) || 'your buddy'} reached a ${relationship.sharedStreak}-day shared streak 🔥`,
              } },
              { upsert: true },
            )))
          }
          const milestone = relationship.sharedStreak % 5 === 0
          const notificationKey = `shared-streak-${milestone ? 'milestone' : 'increment'}-${pairKey(relationship.userIds)}-${date}`
          await Promise.all(relationship.userIds.map(sharedUserId => saveSharedNotification({
            recipientUserId: sharedUserId,
            buddyUserId: sharedUserId === userId ? buddyUserId : userId,
            key: notificationKey,
            type: milestone ? 'shared-streak-milestone' : 'shared-streak-increment',
            sharedStreak: relationship.sharedStreak,
            resultDate: date,
              message: milestone
              ? `🔥 You and ${names.get(sharedUserId === userId ? buddyUserId : userId) || 'your buddy'} reached a ${relationship.sharedStreak}-day shared streak!`
              : `🔥 You and ${names.get(sharedUserId === userId ? buddyUserId : userId) || 'your buddy'} kept your shared streak going! Shared streak: ${relationship.sharedStreak} days.`,
          })))
        }
      }
      await relationship.save()
      sharedResults.push({ buddyUserId, buddyName, sharedStreak: relationship.sharedStreak, status: relationship.status, outcome, previousStreak })
    }

    const personal = { success: finalizedSuccess, currentStreak: user.currentStreak, brokenBeforeFinalize }
    res.json(await streakResponse(user, relationships, { personal, sharedResults }, req.body.activeDay || undefined))
  } catch (error) {
    next(error)
  }
})

router.post('/requests', async (req, res, next) => {
  try {
    const userId = requestUserId(req, res)
    if (!userId) return
    const { buddyUserId } = req.body
    if (!buddyUserId || buddyUserId === userId) return res.status(400).json({ message: 'A different buddy user is required' })
    const buddyUser = await User.findOne({ userId: buddyUserId })
    if (!buddyUser) return res.status(404).json({ message: 'Buddy user not found' })
    const existing = await SavingsBuddy.findOne({ userIds: { $all: [userId, buddyUserId] } })
    if (existing) return res.status(409).json({ message: 'A shared streak relationship already exists' })
    const relationship = await SavingsBuddy.create({ userIds: [userId, buddyUserId], sharedStreak: 0, status: 'pending', invitedBy: userId })
    const relationships = await SavingsBuddy.find({ userIds: userId })
    res.status(201).json(await relationshipResponse(await User.findOne({ userId }), relationships))
  } catch (error) {
    next(error)
  }
})

router.post('/requests/accept', async (req, res, next) => {
  try {
    const userId = requestUserId(req, res)
    if (!userId) return
    const relationship = await SavingsBuddy.findOne({ userIds: userId, status: 'pending', invitedBy: { $ne: userId } })
    if (!relationship) return res.status(404).json({ message: 'Shared streak request not found' })
    relationship.status = 'active'
    relationship.sharedStreak = 0
    relationship.lastCompletedDate = ''
    await relationship.save()
    const relationships = await SavingsBuddy.find({ userIds: userId })
    res.json(await relationshipResponse(await User.findOne({ userId }), relationships))
  } catch (error) {
    next(error)
  }
})

router.post('/achievements/:achievementId/decision', async (req, res, next) => {
  try {
    const userId = requestUserId(req, res)
    if (!userId) return
    const { status } = req.body
    if (!['shared', 'private'].includes(status)) return res.status(400).json({ message: 'status must be shared or private' })
    const achievement = await Achievement.findOneAndUpdate(
      { _id: req.params.achievementId, userId, status: 'pending' },
      { $set: { status } },
      { new: true },
    )
    if (!achievement) return res.status(404).json({ message: 'Pending achievement not found' })
    res.json(achievement)
  } catch (error) {
    next(error)
  }
})

export default router
