import Post from "../models/post.js"
import express from "express"
import CryptoJS from "crypto-js"

const Route = express.Router()

//create
Route.post("/create", async (req,res)=>{
const post = new Post({
    ...req.body
})
try {
    const savedPost = await post.save()
    res.status(201).json(savedPost)
} catch (error) {
    res.status(200).json(error)
}
})

//get all posts
Route.get("/posts", async (req,res)=>{
    try {
        const posts = await Post.find().sort({ createdAt: -1 })
        res.status(200).json(posts)
    } catch (error) {
        res.status(400).json(error)
    }
})

//get post by title
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

//Edit post
Route.put("/:id",async (req,res)=>{
    try {
        const editedPost = await Post.findByIdAndUpdate(req.params.id, {$set:req.body}, { new: true })
        res.status(202).json(editedPost)
    } catch (error) {
        res.status(402).json(error)
    }
})

// delete Post by id
Route.delete("/:id", async (req,res)=>{
    try {
        await Post.findByIdAndDelete(req.params.id)
        res.status(203).json("Post deleted successfully")
    } catch (error) {
        res.status(403).json(error)
    }
})