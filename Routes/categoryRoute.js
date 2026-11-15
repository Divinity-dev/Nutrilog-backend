import express from "express";
import Category from "../models/category.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";

const Route = express.Router();

Route.post("/create", authenticate, requireAdmin, async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    if (!name) return res.status(400).json({ message: "Category name is required." });
    const existingCategory = await Category.findOne({ name: { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } });
    if (existingCategory) return res.status(409).json({ message: "Category already exists." });
    const savedCategory = await Category.create({ name });
    return res.status(201).json(savedCategory);
  } catch {
    return res.status(500).json({ message: "Unable to create category." });
  }
});

Route.get("/categories", async (_req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 });
    return res.status(200).json(categories);
  } catch {
    return res.status(500).json({ message: "Unable to retrieve categories." });
  }
});

export default Route;
