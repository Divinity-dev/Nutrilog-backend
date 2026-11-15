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
app.use(cors({
  origin: [
    "https://www.nutribloghub.com",
    "https://nutribloghub.com",
    "http://localhost:3000",
    "http://192.168.26.209:3000"
  ],
  credentials: true
}));

app.use(express.json({ limit: "2mb" }));

// Routes
app.get("/", (req, res) => {
  res.send("Backend is running 🚀");
});


// const transporter = nodemailer.createTransport({
//   service: "gmail",
//   auth: {
//     user: process.env.EMAIL,
//     pass: process.env.PASSWORD,
//   },
// });
app.use("/api/user", userRoute);
app.use("/api/post", postRoute);
app.use("/api/category", categoryRoute);
app.use("/api/subscribers", subscribersRoute);

// Start server AFTER DB connects
const startServer = async () => {
  await connectDB();

  app.listen(process.env.PORT, () => {
    console.log(`Server running on port ${process.env.PORT}`);
  });
};

startServer();