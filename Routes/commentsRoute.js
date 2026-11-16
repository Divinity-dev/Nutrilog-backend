import express from "express";
import { createHash } from "node:crypto";
import mongoose from "mongoose";
import Comment from "../models/comment.js";
import Post from "../models/post.js";
import User from "../models/user.js";
import { optionalAuthenticate, authenticate, requireAdmin } from "../middleware/auth.js";

const Route = express.Router();
const recentSubmissions = new Map();
const RATE_WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 4;

const clientKey = (req) => createHash("sha256")
  .update(`${req.ip || req.socket?.remoteAddress || "unknown"}|${req.headers["user-agent"] || ""}`)
  .digest("hex");

const clean = (value, max) => String(value || "").trim().slice(0, max);
const publicComment = (comment, viewerKey) => ({
  _id: comment._id,
  authorName: comment.authorName,
  body: comment.body,
  status: comment.status,
  createdAt: comment.createdAt,
  likes: comment.likeKeys?.length || 0,
  likedByMe: Boolean(viewerKey && comment.likeKeys?.includes(viewerKey)),
});

Route.get("/post/:postId", optionalAuthenticate, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.postId)) return res.status(400).json({ message: "Invalid article." });
    const postExists = await Post.exists({ _id: req.params.postId });
    if (!postExists) return res.status(404).json({ message: "Article not found." });
    const comments = await Comment.find({ post: req.params.postId, status: "approved" })
      .sort({ createdAt: -1 }).limit(100).lean();
    const viewerKey = req.user?.id ? `user:${req.user.id}` : `guest:${clientKey(req)}`;
    return res.status(200).json(comments.map((comment) => publicComment(comment, viewerKey)));
  } catch {
    return res.status(500).json({ message: "Unable to load comments." });
  }
});

Route.post("/post/:postId", optionalAuthenticate, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.postId)) return res.status(400).json({ message: "Invalid article." });
    if (clean(req.body.website, 200)) return res.status(201).json({ message: "Comment submitted.", comment: null });
    const post = await Post.findById(req.params.postId).select("_id");
    if (!post) return res.status(404).json({ message: "Article not found." });

    const key = clientKey(req);
    const now = Date.now();
    const recent = recentSubmissions.get(key) || [];
    const active = recent.filter((timestamp) => now - timestamp < RATE_WINDOW_MS);
    if (active.length >= MAX_PER_WINDOW) return res.status(429).json({ message: "Too many comments. Please wait a minute and try again." });

    let authorName;
    let authorEmail;
    let userId = null;
    if (req.user?.id) {
      const user = await User.findById(req.user.id).select("userName email");
      if (!user) return res.status(401).json({ message: "Please sign in again to comment." });
      authorName = clean(user.userName, 80);
      authorEmail = clean(user.email, 254).toLowerCase();
      userId = user._id;
    } else {
      authorName = clean(req.body.authorName, 80);
      authorEmail = clean(req.body.authorEmail, 254).toLowerCase();
    }

    const body = clean(req.body.body, 2000);
    if (!authorName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authorEmail)) {
      return res.status(400).json({ message: "Please provide your name and a valid email address." });
    }
    if (body.length < 3) return res.status(400).json({ message: "Your comment must contain at least 3 characters." });

    const duplicate = await Comment.exists({
      post: post._id,
      authorEmail,
      body,
      createdAt: { $gte: new Date(now - RATE_WINDOW_MS) },
    });
    if (duplicate) return res.status(409).json({ message: "You have already submitted this comment." });

    const comment = await Comment.create({
      post: post._id,
      user: userId,
      authorName,
      authorEmail,
      body,
      status: "approved",
    });
    active.push(now);
    recentSubmissions.set(key, active);
    if (recentSubmissions.size > 5000) {
      for (const [entryKey, timestamps] of recentSubmissions) {
        if (!timestamps.length || now - timestamps[timestamps.length - 1] >= RATE_WINDOW_MS) recentSubmissions.delete(entryKey);
      }
    }
    return res.status(201).json({
      message: "Your comment has been published.",
      comment: publicComment(comment.toObject(), userId ? `user:${userId}` : null),
    });
  } catch {
    return res.status(500).json({ message: "Unable to submit your comment. Please try again." });
  }
});

Route.post("/:commentId/like", optionalAuthenticate, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.commentId)) return res.status(400).json({ message: "Invalid comment." });
    const key = req.user?.id
      ? `user:${req.user.id}`
      : `guest:${clientKey(req)}`;
    const comment = await Comment.findOne({ _id: req.params.commentId, status: "approved" });
    if (!comment) return res.status(404).json({ message: "Comment not found." });
    const alreadyLiked = comment.likeKeys.includes(key);
    await Comment.updateOne(
      { _id: comment._id },
      alreadyLiked ? { $pull: { likeKeys: key } } : { $addToSet: { likeKeys: key } }
    );
    const updated = await Comment.findById(comment._id).select("likeKeys").lean();
    return res.status(200).json({ likes: updated.likeKeys.length, likedByMe: !alreadyLiked });
  } catch {
    return res.status(500).json({ message: "Unable to update comment like." });
  }
});

Route.get("/admin", authenticate, requireAdmin, async (req, res) => {
  try {
    const status = ["approved", "pending", "rejected"].includes(req.query.status) ? req.query.status : null;
    const filter = status ? { status } : {};
    const comments = await Comment.find(filter).populate("post", "title slug").sort({ createdAt: -1 }).limit(300).lean();
    return res.status(200).json(comments.map((comment) => ({
      ...publicComment(comment, null),
      authorEmail: comment.authorEmail,
      status: comment.status,
      post: comment.post,
    })));
  } catch {
    return res.status(500).json({ message: "Unable to load comment moderation." });
  }
});

Route.patch("/:commentId/moderation", authenticate, requireAdmin, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.commentId)) return res.status(400).json({ message: "Invalid comment." });
    const status = ["approved", "pending", "rejected"].includes(req.body.status) ? req.body.status : null;
    if (!status) return res.status(400).json({ message: "Choose a valid moderation status." });
    const comment = await Comment.findByIdAndUpdate(req.params.commentId, { status }, { new: true });
    if (!comment) return res.status(404).json({ message: "Comment not found." });
    return res.status(200).json({ message: "Comment moderation updated.", status: comment.status });
  } catch {
    return res.status(500).json({ message: "Unable to update comment moderation." });
  }
});

Route.delete("/:commentId", authenticate, requireAdmin, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.commentId)) return res.status(400).json({ message: "Invalid comment." });
    const comment = await Comment.findByIdAndDelete(req.params.commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found." });
    return res.status(200).json({ message: "Comment deleted." });
  } catch {
    return res.status(500).json({ message: "Unable to delete comment." });
  }
});

export default Route;
