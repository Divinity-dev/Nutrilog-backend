import Post from "../models/post.js";
import Comment from "../models/comment.js";
import express from "express";
import slugify from "slugify";
import { authenticate, requireAdmin } from "../middleware/auth.js";

const Route = express.Router();

const makeUniqueSlug = async (title, currentId = null) => {
  const baseSlug = slugify(title, { lower: true, strict: true }) || "article";
  let slug = baseSlug;
  let count = 1;
  while (await Post.findOne({ slug, ...(currentId ? { _id: { $ne: currentId } } : {}) })) {
    slug = `${baseSlug}-${count++}`;
  }
  return slug;
};

Route.post("/create", authenticate, requireAdmin, async (req, res) => {
  try {
    const title = String(req.body.title || "").trim();
    if (!title) return res.status(400).json({ message: "Article title is required." });
    const slug = await makeUniqueSlug(title);
    const post = new Post({
      title,
      image: req.body.image || "",
      desc: req.body.desc || "",
      categories: Array.isArray(req.body.categories) ? req.body.categories : [],
      content: Array.isArray(req.body.content) ? req.body.content : [],
      seoTitle: req.body.seoTitle || "",
      seoDescription: req.body.seoDescription || "",
      tags: Array.isArray(req.body.tags) ? req.body.tags : [],
      generatedByAI: Boolean(req.body.generatedByAI),
      status: req.body.status === "draft" ? "draft" : "published",
      slug,
    });
    const savedPost = await post.save();
    return res.status(201).json(savedPost);
  } catch {
    return res.status(500).json({ message: "Unable to create article." });
  }
});

Route.get("/posts", async (req, res) => {
  try {
    const filter = { $or: [{ status: "published" }, { status: { $exists: false } }] };
    if (req.query.category) filter.categories = { $in: [req.query.category] };
    const posts = await Post.find(filter).sort({ createdAt: -1 });
    return res.status(200).json(posts);
  } catch {
    return res.status(500).json({ message: "Unable to retrieve articles." });
  }
});

Route.get("/admin/drafts", authenticate, requireAdmin, async (_req, res) => {
  try {
    const drafts = await Post.find({ status: "draft" }).sort({ updatedAt: -1 }).lean();
    return res.status(200).json(drafts);
  } catch {
    return res.status(500).json({ message: "Unable to retrieve article drafts." });
  }
});

Route.get("/admin/:slug", authenticate, requireAdmin, async (req, res) => {
  try {
    const post = await Post.findOne({ slug: req.params.slug });
    if (!post) return res.status(404).json({ message: "Post not found." });
    return res.status(200).json(post);
  } catch {
    return res.status(500).json({ message: "Unable to retrieve article." });
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
    const updates = {
      title: req.body.title,
      image: req.body.image,
      desc: req.body.desc,
      categories: req.body.categories,
      content: req.body.content,
      seoTitle: req.body.seoTitle,
      seoDescription: req.body.seoDescription,
      tags: req.body.tags,
      status: req.body.status === "draft" ? "draft" : "published",
    };
    Object.keys(updates).forEach((key) => updates[key] === undefined && delete updates[key]);
    if (updates.title) {
      const current = await Post.findOne({ slug: req.params.slug }).select("_id");
      if (!current) return res.status(404).json({ message: "Post not found." });
      updates.slug = await makeUniqueSlug(updates.title, current._id);
    }
    const editedPost = await Post.findOneAndUpdate(
      { slug: req.params.slug },
      { $set: updates },
      { new: true, runValidators: true }
    );
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
    await Comment.deleteMany({ post: deletedPost._id });
    return res.status(200).json({ message: "Article deleted successfully." });
  } catch {
    return res.status(500).json({ message: "Unable to delete article." });
  }
});

export default Route;
