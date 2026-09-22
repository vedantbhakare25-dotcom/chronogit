import mongoose from 'mongoose';

mongoose.set('strictQuery', true);

/**
 * Connects to MongoDB. Exits the process on failure at startup — with no DB
 * there is nothing this API can usefully do, so failing loudly beats
 * serving requests that will all 500.
 */
export async function connectDB(uri = process.env.MONGODB_URI) {
  if (!uri) {
    throw new Error('MONGODB_URI is not set (check your .env file)');
  }
  await mongoose.connect(uri);
  console.log(`[db] connected to ${mongoose.connection.name}`);
  return mongoose.connection;
}

export async function disconnectDB() {
  await mongoose.disconnect();
}