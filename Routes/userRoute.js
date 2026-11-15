import User from "../models/user.js";
import express from "express";
import CryptoJS from "crypto-js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { authenticate, sessionCookieOptions } from "../middleware/auth.js";

const Route = express.Router();

const safeUser = (user) => ({
  _id: user._id,
  userName: user.userName,
  email: user.email,
  role: user.role,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const issueSession = (user, res) => {
  const token = jwt.sign(
    { id: user._id.toString(), email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
  res.cookie("nutriblog_session", token, sessionCookieOptions());
};

Route.post("/register", async (req, res) => {
  try {
    const userName = String(req.body.userName || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!userName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) {
      return res.status(400).json({ message: "Username, a valid email, and a password of at least 8 characters are required." });
    }
    if (!process.env.JWT_SECRET) return res.status(500).json({ message: "Authentication is not configured on the server." });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ userName, email, password: passwordHash, role: "user" });
    return res.status(201).json(safeUser(user));
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "Username or email is already registered." });
    return res.status(500).json({ message: "Unable to register account." });
  }
});

Route.post("/login", async (req, res) => {
  try {
    const identifier = String(req.body.email || req.body.userName || "").trim();
    const password = String(req.body.password || "");
    if (!identifier || !password) return res.status(400).json({ message: "Email/username and password are required." });
    if (!process.env.JWT_SECRET) return res.status(500).json({ message: "Authentication is not configured on the server." });

    const user = await User.findOne({ $or: [{ email: identifier.toLowerCase() }, { userName: identifier }] });
    if (!user) return res.status(401).json({ message: "Invalid email or password." });

    let passwordMatches = false;
    if (user.password.startsWith("$2")) {
      passwordMatches = await bcrypt.compare(password, user.password);
    } else {
      try {
        const legacyPassword = CryptoJS.AES.decrypt(user.password, process.env.crypto_key).toString(CryptoJS.enc.Utf8);
        passwordMatches = Boolean(legacyPassword) && legacyPassword === password;
        if (passwordMatches) user.password = await bcrypt.hash(password, 12);
      } catch {
        passwordMatches = false;
      }
    }

    if (!passwordMatches) return res.status(401).json({ message: "Invalid email or password." });
    if (user.isModified("password")) await user.save();
    issueSession(user, res);
    return res.status(200).json(safeUser(user));
  } catch {
    return res.status(500).json({ message: "Unable to log in." });
  }
});

// One-time administrator claim. Requires the server-only ADMIN_BOOTSTRAP_SECRET.
Route.post("/bootstrap-admin", async (req, res) => {
  try {
    const adminEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    const bootstrapSecret = process.env.ADMIN_BOOTSTRAP_SECRET;
    const suppliedSecret = String(req.body.bootstrapSecret || "");
    if (!adminEmail || !bootstrapSecret) return res.status(503).json({ message: "Administrator bootstrap is not configured." });
    if (suppliedSecret.length !== bootstrapSecret.length || suppliedSecret !== bootstrapSecret) {
      return res.status(403).json({ message: "Invalid administrator setup credential." });
    }

    const user = await User.findOne({ email: adminEmail });
    if (!user) return res.status(404).json({ message: "Register the configured administrator email before completing setup." });
    if (user.role === "admin") return res.status(409).json({ message: "Administrator account has already been initialized." });

    user.role = "admin";
    await user.save();
    issueSession(user, res);
    return res.status(200).json({ message: "Administrator account initialized.", user: safeUser(user) });
  } catch {
    return res.status(500).json({ message: "Unable to initialize administrator account." });
  }
});

Route.get("/me", authenticate, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(401).json({ message: "Account no longer exists." });
  return res.status(200).json(safeUser(user));
});

Route.post("/logout", (_req, res) => {
  res.clearCookie("nutriblog_session", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    path: "/",
  });
  return res.status(200).json({ message: "Logged out successfully." });
});

export default Route;
