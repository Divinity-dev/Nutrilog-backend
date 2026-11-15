import app from "../server.js";
import connectDB from "../db.js";

export default async function handler(req, res) {
  try {
    await connectDB();
    return app(req, res);
  } catch (error) {
    // Keep details in platform logs only.
    console.error("Vercel API initialization failed:", error.message);
    return res.status(503).json({ message: "API is temporarily unavailable. Please try again shortly." });
  }
}
