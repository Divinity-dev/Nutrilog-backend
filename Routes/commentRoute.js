import express from "express";
import mongoose from "mongoose";
import Comment from "../models/comment.js";
import Post from "../models/post.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";

const Route = express.Router();
const recentSubmissions = new Map();
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const cleanText = (value, maxLength) => String(value || "").replace(/<[^>]*>/g, "").replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, maxLength);

Route.get("/post/:slug", async (req, res) => {
  try {
    const post = await Post.findOne({ slug: req.params.slug, $or: [{ status: "published" }, { status: { $exists: false } }] }).select("_id");
    if (!post) return res.status(404).json({ message: "Post not found." });
    const comments = await Comment.find({ post: post._id, status: "approved" })
      .select("name body createdAt")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    return res.status(200).json(comments);
  } catch {
    return res.status(500).json({ message: "Unable to load comments." });
  }
});

Route.post("/post/:slug", async (req, res) => {
  try {
    const post = await Post.findOne({ slug: req.params.slug, $or: [{ status: "published" }, { status: { $exists: false } }] }).select("_id");
    if (!post) return res.status(404).json({ message: "Post not found." });

    const name = cleanText(req.body.name, 80);
    const email = cleanText(req.body.email, 254).toLowerCase();
    const body = cleanText(req.body.body, 2000);
    if (name.length < 2 || !EMAIL_PATTERN.test(email) || body.length < 3) {
      return res.status(400).json({ message: "Please enter your name, a valid email address, and a comment of at least 3 characters." });
    }

    const now = Date.now();
    const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown").split(",")[0].trim();
    const previous = recentSubmissions.get(ip) || [];
    const recent = previous.filter((time) => now - time < 15 * 60 * 1000);
    if (recent.length >= 5) return res.status(429).json({ message: "Too many comments submitted. Please try again later." });
    recent.push(now);
    recentSubmissions.set(ip, recent);

    await Comment.create({ post: post._id, name, email, body, status: "pending" });
    return res.status(201).json({ message: "Thanks! Your comment has been submitted and will appear after moderation." });
  } catch {
    return res.status(500).json({ message: "Unable to submit your comment." });
  }
});

Route.get("/admin", authenticate, requireAdmin, async (req, res) => {
  try {
    const status = ["pending", "approved", "rejected"].includes(req.query.status) ? req.query.status : "pending";
    const comments = await Comment.find({ status })
      .select("+email")
      .populate("post", "title slug")
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    return res.status(200).json(comments.map(({ email, ...comment }) => ({ ...comment, email })));
  } catch {
    return res.status(500).json({ message: "Unable to retrieve comments." });
  }
});

Route.patch("/:id/moderate", authenticate, requireAdmin, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid comment ID." });
    const status = String(req.body.status || "");
    if (!["approved", "rejected", "pending"].includes(status)) return res.status(400).json({ message: "Invalid moderation status." });
    const comment = await Comment.findByIdAndUpdate(req.params.id, { status, moderatedAt: new Date() }, { new: true }).select("-email");
    if (!comment) return res.status(404).json({ message: "Comment not found." });
    return res.status(200).json(comment);
  } catch {
    return res.status(500).json({ message: "Unable to update comment." });
  }
});

Route.delete("/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const comment = await Comment.findByIdAndDelete(req.params.id);
    if (!comment) return res.status(404).json({ message: "Comment not found." });
    return res.status(200).json({ message: "Comment deleted." });
  } catch {
    return res.status(500).json({ message: "Unable to delete comment." });
  }
});

export default Route;
