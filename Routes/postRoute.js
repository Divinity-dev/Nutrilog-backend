import Post from "../models/post.js";
import express from "express";
import { sendEmail } from "../utils/mail.js";
import Subscriber from "../models/subscribers.js";
import slugify from "slugify";
import { authenticate, requireAdmin } from "../middleware/auth.js";

const Route = express.Router();

Route.post("/create", authenticate, requireAdmin, async (req, res) => {
  try {
    const { title } = req.body;
    if (!title || !String(title).trim()) return res.status(400).json({ message: "Article title is required." });
    const baseSlug = slugify(title, { lower: true, strict: true }) || "article";
    let slug = baseSlug;
    let count = 1;
    while (await Post.findOne({ slug })) slug = `${baseSlug}-${count++}`;

    const post = new Post({ ...req.body, slug });
    const savedPost = await post.save();

    // Newsletter delivery is intentionally left for the dedicated email/queue phase.
    const subscribers = await Subscriber.find({ status: { $ne: "unsubscribed" } }).select("email");
    const postUrl = `https://www.nutribloghub.com/blog/${savedPost.slug}`;
    setImmediate(async () => {
      const results = await Promise.allSettled(subscribers.map((sub) => sendEmail({
        to: sub.email,
        subject: `New Post: ${savedPost.title}`,
        html: `<p>A new article is available on NutriBlogHub.</p><p><a href="${postUrl}">Read the article</a></p>`,
      })));
      results.forEach((result) => {
        if (result.status === "rejected") console.error("Newsletter delivery failed:", result.reason);
      });
    });

    return res.status(201).json(savedPost);
  } catch {
    return res.status(500).json({ message: "Unable to create article." });
  }
});

Route.get("/posts", async (req, res) => {
  try {
    const filter = req.query.category ? { categories: { $in: [req.query.category] } } : {};
    const posts = await Post.find(filter).sort({ createdAt: -1 });
    return res.status(200).json(posts);
  } catch {
    return res.status(500).json({ message: "Unable to retrieve articles." });
  }
});

Route.get("/:slug", async (req, res) => {
  try {
    const post = await Post.findOne({ slug: req.params.slug });
    if (!post) return res.status(404).json({ message: "Post not found." });
    return res.status(200).json(post);
  } catch {
    return res.status(500).json({ message: "Unable to retrieve article." });
  }
});

Route.put("/:slug", authenticate, requireAdmin, async (req, res) => {
  try {
    const editedPost = await Post.findOneAndUpdate({ slug: req.params.slug }, { $set: req.body }, { new: true, runValidators: true });
    if (!editedPost) return res.status(404).json({ message: "Post not found." });
    return res.status(200).json(editedPost);
  } catch {
    return res.status(500).json({ message: "Unable to update article." });
  }
});

Route.delete("/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const deletedPost = await Post.findByIdAndDelete(req.params.id);
    if (!deletedPost) return res.status(404).json({ message: "Post not found." });
    return res.status(200).json({ message: "Article deleted successfully." });
  } catch {
    return res.status(500).json({ message: "Unable to delete article." });
  }
});

export default Route;
