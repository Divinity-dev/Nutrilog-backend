import post from "../models/post.js";
import Post from "../models/post.js";
import express from "express";

const Route = express.Router();

// CREATE
Route.post("/create", async (req, res) => {
  try {
    const post = new Post({
      ...req.body,
    });

    const savedPost = await post.save();
    res.status(201).json(savedPost);
  } catch (error) {
    res.status(500).json(error); 
  }
});

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
Route.get("/post/:slug", async (req, res) => {
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
Route.put("/:id", async (req, res) => {
  try {
    const editedPost = await Post.findByIdAndUpdate(
      req.params.id,
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