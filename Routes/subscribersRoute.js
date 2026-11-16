import express from "express";
import { createHash, randomBytes, createHmac, timingSafeEqual } from "node:crypto";
import Subscriber from "../models/subscribers.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { sendEmail } from "../utils/mail.js";

const Route = express.Router();
const siteUrl = (process.env.FRONTEND_URL || "https://www.nutribloghub.com").split(",")[0].trim().replace(/\/$/, "");
const hashToken = (token) => createHash("sha256").update(token).digest("hex");
const unsubscribeTokenFor = (subscriber) => createHmac("sha256", process.env.JWT_SECRET)
  .update(`${subscriber._id}:${subscriber.email}:unsubscribe`).digest("hex");

Route.post("/subscribe", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: "Please enter a valid email address." });
    }
    let subscriber = await Subscriber.findOne({ email });
    if (subscriber && (subscriber.status === "active" || !subscriber.status)) {
      return res.status(200).json({ message: "You're already subscribed to new NutriBlogHub articles." });
    }

    const token = randomBytes(32).toString("hex");
    const values = {
      status: "pending",
      confirmationTokenHash: hashToken(token),
      confirmationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      source: String(req.body.source || "website").slice(0, 40),
    };
    if (!subscriber) subscriber = await Subscriber.create({ email, ...values });
    else {
      Object.assign(subscriber, values);
      await subscriber.save();
    }

    const confirmUrl = `${siteUrl}/confirm-subscription?token=${token}`;
    await sendEmail({
      to: email,
      subject: "Confirm your NutriBlogHub subscription",
      text: `Confirm your subscription to new NutriBlogHub article notifications: ${confirmUrl}\n\nIf you did not request this, ignore this email.`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#222"><h2>Confirm your subscription</h2><p>Thanks for subscribing. Confirm your email to receive notifications when we publish new articles.</p><p><a href="${confirmUrl}" style="display:inline-block;background:#15803d;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none">Confirm subscription</a></p><p>This link expires in 24 hours. If you did not request this, ignore this email.</p></div>`,
    });
    return res.status(200).json({ message: "Check your inbox and confirm your email to complete your subscription." });
  } catch (error) {
    if (error.code === 11000) return res.status(200).json({ message: "If you requested a subscription, please check your inbox for a confirmation email." });
    return res.status(503).json({ message: "We couldn't send your confirmation email right now. Please try again shortly." });
  }
});

Route.post("/confirm/:token", async (req, res) => {
  try {
    const token = String(req.params.token || "");
    if (!/^[a-f0-9]{64}$/i.test(token)) return res.status(400).json({ message: "This confirmation link is invalid." });
    const subscriber = await Subscriber.findOne({
      confirmationTokenHash: hashToken(token),
      confirmationExpiresAt: { $gt: new Date() },
    }).select("+confirmationTokenHash +confirmationExpiresAt");
    if (!subscriber) return res.status(400).json({ message: "This confirmation link has expired or was already used. Please subscribe again." });
    subscriber.status = "active";
    subscriber.confirmedAt = new Date();
    subscriber.confirmationTokenHash = undefined;
    subscriber.confirmationExpiresAt = undefined;
    await subscriber.save();
    return res.status(200).json({ message: "Your subscription is confirmed. You'll receive an email when we publish a new article." });
  } catch {
    return res.status(500).json({ message: "Unable to confirm your subscription." });
  }
});

Route.post("/unsubscribe/:id", async (req, res) => {
  try {
    const subscriber = await Subscriber.findById(req.params.id);
    const token = String(req.body.token || "");
    if (!subscriber || !/^[a-f0-9]{64}$/i.test(token)) return res.status(400).json({ message: "This unsubscribe link is invalid." });
    const expected = unsubscribeTokenFor(subscriber);
    const actualBuffer = Buffer.from(token);
    const expectedBuffer = Buffer.from(expected);
    if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
      return res.status(400).json({ message: "This unsubscribe link is invalid." });
    }
    subscriber.status = "unsubscribed";
    subscriber.unsubscribedAt = new Date();
    await subscriber.save();
    return res.status(200).json({ message: "You have been unsubscribed from NutriBlogHub article notifications." });
  } catch {
    return res.status(500).json({ message: "Unable to unsubscribe right now." });
  }
});

Route.get("/subscribers", authenticate, requireAdmin, async (_req, res) => {
  try {
    const subscribers = await Subscriber.find().select("email status source createdAt confirmedAt unsubscribedAt").sort({ createdAt: -1 }).lean();
    const normalized = subscribers.map((item) => ({ ...item, status: item.status || "active" }));
    return res.status(200).json({
      subscribers: normalized,
      total: normalized.length,
      activeCount: normalized.filter((item) => item.status === "active").length,
      pendingCount: normalized.filter((item) => item.status === "pending").length,
      unsubscribedCount: normalized.filter((item) => item.status === "unsubscribed").length,
    });
  } catch {
    return res.status(500).json({ message: "Unable to retrieve subscribers." });
  }
});

export default Route;
