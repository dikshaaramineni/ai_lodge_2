import mongoose from 'mongoose'

export async function connectDatabase() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required in .env')
  }

  await mongoose.connect(process.env.MONGODB_URI)
  console.log('Connected to MongoDB')
}

export async function disconnectDatabase() {
  await mongoose.disconnect()
}
