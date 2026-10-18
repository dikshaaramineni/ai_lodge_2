import express from 'express'
import CommunityPost from '../models/CommunityPost.js'
import SavingsBuddy from '../models/SavingsBuddy.js'
import User from '../models/User.js'
import FriendRequest from '../models/FriendRequest.js'
import Achievement from '../models/Achievement.js'

const router = express.Router()

function requestUserId(req, res) {
  const userId = req.query.userId || req.body?.userId
  if (!userId || typeof userId !== 'string') {
    res.status(400).json({ message: 'userId is required' })
    return null
  }
  return userId
}

async function connectedUserIds(userId) {
  const buddies = await SavingsBuddy.find({ userIds: userId, status: 'active' }).lean()
  const accepted = await FriendRequest.find({ $or: [{ fromUserId: userId }, { toUserId: userId }], status: 'accepted' }).lean()
  const friends = accepted.flatMap(request => [request.fromUserId, request.toUserId])
  return [...new Set([userId, ...buddies.flatMap(buddy => buddy.userIds), ...friends])]
}

async function relationshipResponse(userId) {
  const requests = await FriendRequest.find({ $or: [{ fromUserId: userId }, { toUserId: userId }] }).sort({ createdAt: -1 }).lean()
  const connectedIds = requests.filter(request => request.status === 'accepted').flatMap(request => [request.fromUserId, request.toUserId]).filter(id => id !== userId)
  const pendingIncoming = requests.filter(request => request.toUserId === userId && request.status === 'pending')
  const userIds = [...new Set([...connectedIds, ...pendingIncoming.map(request => request.fromUserId)])]
  const users = await User.find({ userId: { $in: userIds } }).select('userId displayName username').lean()
  const byId = new Map(users.map(user => [user.userId, user]))
  const person = userIdValue => ({ userId: userIdValue, name: byId.get(userIdValue)?.displayName || userIdValue, username: byId.get(userIdValue)?.username || userIdValue })
  return {
    friends: [...new Set(connectedIds)].map(person),
    incomingRequests: pendingIncoming.map(request => ({ id: request._id, ...person(request.fromUserId) })),
  }
}

async function postResponse(posts) {
  const userIds = [...new Set(posts.map(post => post.userId))]
  const users = await User.find({ userId: { $in: userIds } }).select('userId displayName').lean()
  const names = new Map(users.map(user => [user.userId, user.displayName]))
  return posts.map(post => {
    const name = names.get(post.userId) || 'CashLing user'
    return { ...post, name, initials: name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase() }
  })
}

router.get('/posts', async (req, res, next) => {
  try {
    const userId = requestUserId(req, res)
    if (!userId) return
    const posts = await CommunityPost.find({ userId: { $in: await connectedUserIds(userId) }, type: 'win' }).sort({ createdAt: -1 }).lean()
    res.json(await postResponse(posts))
  } catch (error) {
    next(error)
  }
})

router.post('/posts', async (req, res, next) => {
  try {
    const userId = requestUserId(req, res)
    if (!userId) return
    const { type = 'win', text, sourceAchievementId } = req.body
    if (type !== 'win' || typeof text !== 'string' || !text.trim()) return res.status(400).json({ message: 'A win post text is required' })
    const user = await User.findOne({ userId })
    if (!user) return res.status(404).json({ message: 'User not found' })
    let achievement = null
    if (sourceAchievementId) {
      achievement = await Achievement.findOne({ _id: sourceAchievementId, userId })
      if (!achievement) return res.status(404).json({ message: 'Achievement not found' })
      if (['private', 'expired', 'revoked'].includes(achievement.status)) return res.status(409).json({ message: 'Achievement is not shareable' })
      const existingPost = await CommunityPost.findOne({ sourceAchievementId })
      if (existingPost) {
        if (achievement.status === 'pending') {
          achievement.status = 'shared'
          await achievement.save()
        }
        return res.json((await postResponse([existingPost.toObject()]))[0])
      }
    }
    const postData = { userId, type, text: text.trim() }
    if (!sourceAchievementId) {
      const post = await CommunityPost.create(postData)
      return res.status(201).json((await postResponse([post.toObject()]))[0])
    }
    postData.sourceAchievementId = sourceAchievementId
    let post
    try {
      post = await CommunityPost.findOneAndUpdate(
        sourceAchievementId ? { sourceAchievementId } : { userId, text: text.trim(), type },
        { $setOnInsert: postData },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
    } catch (error) {
      if (error?.code !== 11000 || !sourceAchievementId) throw error
      post = await CommunityPost.findOne({ sourceAchievementId })
    }
    if (achievement?.status === 'pending') {
      achievement.status = 'shared'
      await achievement.save()
    }
    res.json((await postResponse([post.toObject()]))[0])
  } catch (error) {
    next(error)
  }
})

router.get('/relationships', async (req, res, next) => {
  try {
    const userId = requestUserId(req, res)
    if (!userId) return
    res.json(await relationshipResponse(userId))
  } catch (error) {
    next(error)
  }
})

router.post('/friends/requests', async (req, res, next) => {
  try {
    const userId = requestUserId(req, res)
    if (!userId) return
    const username = String(req.body.username || '').trim().replace(/^@/, '').toLowerCase()
    const target = await User.findOne({ username })
    if (!target) return res.status(404).json({ message: 'User not found' })
    if (target.userId === userId) return res.status(400).json({ message: 'You cannot friend yourself' })
    const existing = await FriendRequest.findOne({ $or: [{ fromUserId: userId, toUserId: target.userId }, { fromUserId: target.userId, toUserId: userId }] })
    if (existing?.status === 'declined') {
      existing.fromUserId = userId
      existing.toUserId = target.userId
      existing.status = 'pending'
      await existing.save()
      return res.status(201).json({ id: existing._id, ...personForUser(target) })
    }
    if (existing) return res.status(409).json({ message: 'A friendship or request already exists' })
    const request = await FriendRequest.create({ fromUserId: userId, toUserId: target.userId })
    res.status(201).json({ id: request._id, ...personForUser(target) })
  } catch (error) {
    next(error)
  }
})

router.post('/friends/requests/:requestId', async (req, res, next) => {
  try {
    const userId = requestUserId(req, res)
    if (!userId) return
    const action = req.body.action
    if (!['accept', 'decline'].includes(action)) return res.status(400).json({ message: 'action must be accept or decline' })
    const request = await FriendRequest.findOne({ _id: req.params.requestId, toUserId: userId, status: 'pending' })
    if (!request) return res.status(404).json({ message: 'Pending friend request not found' })
    request.status = action === 'accept' ? 'accepted' : 'declined'
    await request.save()
    res.json(await relationshipResponse(userId))
  } catch (error) {
    next(error)
  }
})

router.delete('/friends/:friendUserId', async (req, res, next) => {
  try {
    const userId = requestUserId(req, res)
    if (!userId) return
    const friendUserId = req.params.friendUserId
    if (friendUserId === userId) return res.status(400).json({ message: 'You cannot remove yourself' })
    await FriendRequest.deleteOne({
      $or: [
        { fromUserId: userId, toUserId: friendUserId, status: 'accepted' },
        { fromUserId: friendUserId, toUserId: userId, status: 'accepted' },
      ],
    })
    await SavingsBuddy.deleteOne({ userIds: { $all: [userId, friendUserId] } })
    res.json(await relationshipResponse(userId))
  } catch (error) {
    next(error)
  }
})

function personForUser(user) { return { userId: user.userId, name: user.displayName, username: user.username } }

export default router
