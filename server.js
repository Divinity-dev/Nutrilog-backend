import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import dotenv from 'dotenv';

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
mongoose.connect(process.env.Mongo_url)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.log(err));

// Route
app.get("/", (req, res) => {
  res.send("Backend is running 🚀");
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});