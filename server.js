import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import dotenv from 'dotenv';
import postRoute from "./Routes/postRoute.js"
import categoryRoute from "./Routes/categoryRoute.js"
import userRoute from "./Routes/userRoute.js"
import subscribersRoute from "./Routes/subscribersRoute.js"


dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
mongoose.connect(process.env.Mongo_url, )
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.log(err));

// Route
app.get("/", (req, res) => {
  res.send("Backend is running 🚀");
});

app.use("/api/user", userRoute)
app.use("/api/post", postRoute)
app.use("/api/categories", categoryRoute)
app.use("/api/subscribers", subscribersRoute)


app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});