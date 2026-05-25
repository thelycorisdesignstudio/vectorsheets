import mongoose from 'mongoose';

export async function connectDatabase() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    return { mode: 'memory', message: 'MONGODB_URI not set; using in-memory workbooks.' };
  }

  try {
    mongoose.set('strictQuery', true);
    await mongoose.connect(uri, {
      dbName: process.env.MONGODB_DB || undefined,
      serverSelectionTimeoutMS: 4500
    });

    return { mode: 'mongo', message: 'MongoDB connected.' };
  } catch (error) {
    console.warn('[vectorsheets] MongoDB unavailable, falling back to memory:', error.message);
    return { mode: 'memory', message: 'MongoDB unavailable; using in-memory workbooks.' };
  }
}

export function isMongoReady() {
  return mongoose.connection.readyState === 1;
}
