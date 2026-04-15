import express from "express";
import Category from "../models/category.js";

const Route = express.Router();

// CREATE CATEGORY
Route.post("/category/create", async (req, res) => {
  try {
    
    const existingCategory = await Category.findOne({
      name: req.body.name,
    });

    if (existingCategory) {
      return res.status(400).json("Category already exists");
    }

    const cat = new Category(req.body);

    const savedCategory = await cat.save(); 

    res.status(201).json(savedCategory); 
  } catch (error) {
    res.status(500).json(error); 
  }
});

export default Route;