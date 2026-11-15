import mongoose from "mongoose";

let cached = globalThis.__nutriblogMongoose;

if (!cached) {
  cached = globalThis.__nutriblogMongoose = { conn: null, promise: null };
}

const connectDB = async () => {
  const mongoUri = process.env.MONGODB_URI || process.env.Mongo_url;

  if (!mongoUri) {
    throw new Error("Missing MongoDB connection string. Set MONGODB_URI in the Vercel project environment.");
  }

  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(mongoUri, {
      bufferCommands: false,
      serverSelectionTimeoutMS: 10000,
      maxPoolSize: 5,
    }).then((mongooseInstance) => mongooseInstance).catch((error) => {
      cached.promise = null;
      throw error;
    });
  }

  cached.conn = await cached.promise;
  return cached.conn;
};

export default connectDB;
