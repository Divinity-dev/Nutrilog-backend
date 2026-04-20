import express, { Router } from "express";
import Category from "../models/category.js";

const Route = express.Router();

// CREATE CATEGORY
Route.post("/create", async (req, res) => {
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

// get all categories
Route.get("/categories", async (req, res)=>{
  try {
    const cat = await Category.find()
    res.status(200).json(cat)
  } catch (error) {
    res.status(400).json(error)
  }
})

export default Route;