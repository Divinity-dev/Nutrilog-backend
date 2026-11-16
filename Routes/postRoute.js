import Post from "../models/post.js";
import express from "express";
import slugify from "slugify";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { getReusablePostImage } from "../utils/articleImages.js";

const Route = express.Router();

Route.post("/create", authenticate, requireAdmin, async (req, res) => {
  try {
    const { title } = req.body;
    if (!title || !String(title).trim()) return res.status(400).json({ message: "Article title is required." });
    const baseSlug = slugify(title, { lower: true, strict: true }) || "article";
    let slug = baseSlug;
    let count = 1;
    while (await Post.findOne({ slug })) slug = `${baseSlug}-${count++}`;

    const payload = { ...req.body, slug };
    if (!String(payload.image || "").trim()) {
      const reusedImage = await getReusablePostImage({ categories: payload.categories || [] });
      payload.image = reusedImage || "";
      payload.imageSource = reusedImage ? "reused" : "none";
    } else {
      payload.imageSource = payload.imageSource || "manual";
    }
    const post = new Post(payload);
    const savedPost = await post.save();

    // Subscriber notifications are handled separately by a durable email workflow.

    return res.status(201).json(savedPost);
  } catch {
    return res.status(500).json({ message: "Unable to create article." });
  }
});

Route.get("/posts", async (req, res) => {
  try {
    const filter = {
      $and: [
        { $or: [{ status: "published" }, { status: { $exists: false } }] },
        ...(req.query.category ? [{ categories: { $in: [req.query.category] } }] : []),
      ],
    };
    const posts = await Post.find(filter).sort({ createdAt: -1 });
    return res.status(200).json(posts);
  } catch {
    return res.status(500).json({ message: "Unable to retrieve articles." });
  }
});

Route.get("/:slug", async (req, res) => {
  try {
    const post = await Post.findOne({
      slug: req.params.slug,
      $or: [{ status: "published" }, { status: { $exists: false } }],
    });
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
