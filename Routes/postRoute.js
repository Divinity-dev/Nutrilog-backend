import Post from "../models/post.js";
import express from "express";
import { sendEmail } from "../utils/mail.js";
import Subscriber from "../models/subscribers.js";




const Route = express.Router();
//create post
import slugify from "slugify";

Route.post("/create", async (req, res) => {
  try {
    const { title } = req.body;

    // 1. Generate base slug
    const baseSlug = slugify(title, {
      lower: true,
      strict: true,
    });

    // 2. Ensure uniqueness
    let slug = baseSlug;
    let count = 1;

    while (await Post.findOne({ slug })) {
      slug = `${baseSlug}-${count}`;
      count++;
    }

    // 3. Create post with generated slug
    const post = new Post({
      ...req.body,
      slug,
    });

    const savedPost = await post.save();

    // 4. Send emails to subscribers
    const subscribers = await Subscriber.find();
     
 const postUrl = `https://www.nutribloghub.com/post/${savedPost.slug}`;

await Promise.all(
  subscribers.map((sub) =>
    sendEmail({
      to: sub.email,
      subject: `🆕 New Post: ${savedPost.title}`,
      html: `
        <div style="font-family: Arial, sans-serif; background:#f9f9f9; padding:20px;">
          <div style="max-width:600px; margin:auto; background:#fff; padding:20px; border-radius:10px;">
            
            <h1 style="color:#111;">${savedPost.title}</h1>

            <p style="color:#555;">
              A new article is now available on NutriBlog.
            </p>

            <a href="${postUrl}" 
               style="display:inline-block; padding:12px 18px; background:#16a34a; color:#fff; text-decoration:none; border-radius:6px;">
               Read Full Post
            </a>

            <p style="margin-top:20px; font-size:12px; color:#888;">
              Thanks for subscribing 🙌
            </p>

          </div>
        </div>
      `,
    })
  )
);

    res.status(201).json(savedPost);
  } catch (error) {
    res.status(500).json(error);
  }
});

//get all posts

Route.get("/posts", async (req, res) => {
  try {
    const cat = req.query.category;

    let posts;

    if (cat) {
      posts = await Post.find({
        categories: { $in: [cat] },
      }).sort({ createdAt: -1 });
    } else {
      posts = await Post.find().sort({ createdAt: -1 });
    }

    res.status(200).json(posts);
  } catch (error) {
    res.status(500).json(error);
  }
});

// GET SINGLE POST BY SLUG
Route.get("/:slug", async (req, res) => {
  try {
    const post = await Post.findOne({ slug: req.params.slug });

    if (!post) {
      return res.status(404).json("Post not found"); 
    }

    res.status(200).json(post);
  } catch (error) {
    res.status(500).json(error); 
  }
});

// UPDATE POST
Route.put("/:slug", async (req, res) => {
  try {
    const editedPost = await Post.findOneAndUpdate(
      { slug: req.params.slug },
      { $set: req.body },
      { new: true }
    );

    if (!editedPost) {
      return res.status(404).json("Post not found");
    }

    res.status(200).json(editedPost);
  } catch (error) {
    res.status(500).json(error);
  }
});

// DELETE POST
Route.delete("/:id", async (req, res) => {
  try {
    const deletedPost = await Post.findByIdAndDelete(req.params.id);

    if (!deletedPost) {
      return res.status(404).json("Post not found"); 
    }

    res.status(200).json("Post deleted successfully"); 
  } catch (error) {
    res.status(500).json(error); 
  }
});

export default Route;