import mongoose from "mongoose";

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

const connectDB = async () => {
  if (cached.conn) {
    console.log("Using existing DB connection");
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(process.env.Mongo_url, {
      
    });
  }

  cached.conn = await cached.promise;
  console.log("MongoDB connected");

  return cached.conn;
};

export default connectDB;