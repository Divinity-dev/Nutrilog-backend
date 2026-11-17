import Post from "../models/post.js";
import Comment from "../models/comment.js";
import express from "express";
import slugify from "slugify";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { notifySubscribersOfPost } from "../utils/subscriberNotifications.js";
import { getReusablePostImage } from "../utils/articleImages.js";

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
    const categories = Array.isArray(req.body.categories) ? req.body.categories : [];
    const uploadedImage = String(req.body.image || "").trim();
    const reusedImage = uploadedImage ? null : await getReusablePostImage({ categories });
    const image = uploadedImage || reusedImage?.image || process.env.DEFAULT_ARTICLE_IMAGE_URL || "/images/nutriblog-default.svg";
    const imageSource = uploadedImage
      ? (req.body.imageSource || (req.body.imageCredit?.provider === "Pexels" ? "pexels" : "manual"))
      : reusedImage ? "reused" : "default";
    const post = new Post({
      title,
      image,
      imageSource,
      imageCredit: req.body.imageCredit || reusedImage?.imageCredit || undefined,
      desc: req.body.desc || "",
      categories,
      content: Array.isArray(req.body.content) ? req.body.content : [],
      seoTitle: req.body.seoTitle || "",
      seoDescription: req.body.seoDescription || "",
      tags: Array.isArray(req.body.tags) ? req.body.tags : [],
      generatedByAI: Boolean(req.body.generatedByAI),
      status: req.body.status === "draft" ? "draft" : "published",
      slug,
    });
    const savedPost = await post.save();
    try {
      await notifyAdminOfPost(savedPost);
    } catch (error) {
      console.error("Admin article creation email failed:", error.message);
    }
    if (savedPost.status === "published") {
      try {
        const notificationResult = await notifySubscribersOfPost(savedPost);
        console.info("Subscriber notifications completed:", { postId: savedPost._id, ...notificationResult });
      } catch (error) {
        console.error("Subscriber notification failed:", error.message);
      }
    }
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


Route.get("/:id/likes", async (req, res) => {
  try {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ message: "Invalid article ID." });
    const visitorId = String(req.query.visitorId || "");
    const post = await Post.findOne({
      _id: req.params.id,
      $or: [{ status: "published" }, { status: { $exists: false } }],
    }).select("+likeVisitors");
    if (!post) return res.status(404).json({ message: "Article not found." });
    return res.status(200).json({
      likesCount: post.likeVisitors.length,
      liked: visitorId ? post.likeVisitors.includes(visitorId) : false,
    });
  } catch {
    return res.status(500).json({ message: "Unable to retrieve article likes." });
  }
});

Route.post("/:id/like", async (req, res) => {
  try {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ message: "Invalid article ID." });
    const visitorId = String(req.body.visitorId || "");
    if (!/^[a-zA-Z0-9-]{16,80}$/.test(visitorId)) {
      return res.status(400).json({ message: "A valid visitor ID is required." });
    }
    const post = await Post.findOne({
      _id: req.params.id,
      $or: [{ status: "published" }, { status: { $exists: false } }],
    }).select("+likeVisitors");
    if (!post) return res.status(404).json({ message: "Article not found." });

    const alreadyLiked = post.likeVisitors.includes(visitorId);
    if (alreadyLiked) {
      post.likeVisitors.pull(visitorId);
    } else {
      post.likeVisitors.addToSet(visitorId);
    }
    await post.save();

    return res.status(200).json({
      likesCount: post.likeVisitors.length,
      liked: !alreadyLiked,
    });
  } catch {
    return res.status(500).json({ message: "Unable to update article like." });
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
      imageCredit: req.body.imageCredit,
      imageSource: req.body.imageSource,
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
    const currentPost = await Post.findOne({ slug: req.params.slug }).select("status image categories");
    if (!currentPost) return res.status(404).json({ message: "Post not found." });
    if (updates.image === "") {
      const reusedImage = await getReusablePostImage({
        categories: updates.categories || currentPost.categories,
        excludeImage: currentPost.image,
      });
      updates.image = reusedImage?.image || process.env.DEFAULT_ARTICLE_IMAGE_URL || "/images/nutriblog-default.svg";
      updates.imageSource = reusedImage ? "reused" : "default";
      updates.imageCredit = reusedImage?.imageCredit || undefined;
    } else if (updates.image && !updates.imageSource) {
      updates.imageSource = updates.imageCredit?.provider === "Pexels" ? "pexels" : "manual";
    }
    const previousPost = currentPost;
    const editedPost = await Post.findOneAndUpdate(
      { slug: req.params.slug },
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!editedPost) return res.status(404).json({ message: "Post not found." });
    if (previousPost?.status !== "published" && editedPost.status === "published") {
      try {
        const notificationResult = await notifySubscribersOfPost(editedPost);
        console.info("Subscriber notifications completed:", { postId: editedPost._id, ...notificationResult });
      } catch (error) {
        console.error("Subscriber notification failed:", error.message);
      }
    }
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
