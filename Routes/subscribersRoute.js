import express from "express";
import Subscriber from "../models/subscribers.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";

const Route = express.Router();

Route.post("/subscribe", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: "A valid email address is required." });
    }
    const existing = await Subscriber.findOne({ email });
    if (existing) return res.status(200).json({ message: "Already subscribed." });
    await Subscriber.create({ email });
    return res.status(201).json({ message: "Subscribed successfully." });
  } catch (error) {
    if (error.code === 11000) return res.status(200).json({ message: "Already subscribed." });
    return res.status(500).json({ message: "Unable to subscribe." });
  }
});

Route.get("/subscribers", authenticate, requireAdmin, async (_req, res) => {
  try {
    const subscribers = await Subscriber.find().sort({ createdAt: -1 });
    return res.status(200).json(subscribers);
  } catch {
    return res.status(500).json({ message: "Unable to retrieve subscribers." });
  }
});

export default Route;
