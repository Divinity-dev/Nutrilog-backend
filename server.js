import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import postRoute from "./Routes/postRoute.js";
import categoryRoute from "./Routes/categoryRoute.js";
import userRoute from "./Routes/userRoute.js";
import subscribersRoute from "./Routes/subscribersRoute.js";
import connectDB from "./db.js";

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.get("/", (req, res) => {
  res.send("Backend is running 🚀");
});

app.use("/api/user", userRoute);
app.use("/api/post", postRoute);
app.use("/api/category", categoryRoute);
app.use("/api/subscribers", subscribersRoute);

// Start server before bd connect DB connects
const startServer = async () => {
  app.listen(process.env.PORT, () => {
    console.log(`Server running on port ${process.env.PORT}`);
  });

  connectDB().catch(err => {
    console.error("DB connection failed:", err);
  });
};

startServer();

