import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import postRoute from "./Routes/postRoute.js";
import categoryRoute from "./Routes/categoryRoute.js";
import userRoute from "./Routes/userRoute.js";
import subscribersRoute from "./Routes/subscribersRoute.js";

dotenv.config();

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

const allowedOrigins = new Set([
  "https://www.nutribloghub.com",
  "https://nutribloghub.com",
  "http://localhost:3000",
  "http://192.168.26.209:3000",
  ...(process.env.FRONTEND_URL || "").split(",").map((origin) => origin.trim()).filter(Boolean),
]);

app.use(cors({
  origin(origin, callback) {
    // Requests without an Origin header include server-to-server and health checks.
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error("Origin not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 86400,
}));

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

app.get("/", (_req, res) => {
  res.status(200).json({ message: "NutriBlogHub API is running", status: "ok" });
});

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", service: "nutribloghub-api" });
});

app.use("/api/user", userRoute);
app.use("/api/post", postRoute);
app.use("/api/category", categoryRoute);
app.use("/api/subscribers", subscribersRoute);

app.use((req, res) => {
  res.status(404).json({ message: "API route not found", path: req.path });
});

app.use((error, _req, res, _next) => {
  // Avoid leaking stack traces or configuration details to clients.
  if (error.message === "Origin not allowed by CORS") {
    return res.status(403).json({ message: "This website is not allowed to access the API." });
  }
  return res.status(500).json({ message: "Internal server error." });
});

export default app;
