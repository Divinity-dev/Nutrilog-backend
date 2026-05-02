import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import postRoute from "./Routes/postRoute.js";
import categoryRoute from "./Routes/categoryRoute.js";
import userRoute from "./Routes/userRoute.js";
import subscribersRoute from "./Routes/subscribersRoute.js";
import connectDB from "./db.js";
import nodemailer from "nodemailer";

dotenv.config();

const app = express();

// Middleware
app.use(cors({
  origin: [
    "https://www.nutribloghub.com",
    "http://localhost:3000"
  ],
  credentials: true
}));

app.use(express.json());

// Routes
app.get("/", (req, res) => {
  res.send("Backend is running 🚀");
});


const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL,
    pass: process.env.PASSWORD,
  },
});
app.get("/test-email-live", async (req, res) => {
  try {
    console.log("TEST ROUTE HIT");

    console.log("EMAIL:", process.env.EMAIL);
    console.log("PASSWORD LENGTH:", process.env.PASSWORD?.length);

    const info = await transporter.sendMail({
      from: process.env.EMAIL,
      to: process.env.EMAIL,
      subject: "Render Live Test",
      text: "If you see this, production email works",
    });

    console.log("EMAIL SENT:", info.response);

    res.send("Email sent successfully");
  } catch (err) {
    console.log("EMAIL ERROR:", err);
    res.status(500).send("Email failed");
  }
});

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