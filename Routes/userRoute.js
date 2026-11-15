import User from "../models/user.js";
import express from "express";
import CryptoJS from "crypto-js";
import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { authenticate, sessionCookieOptions } from "../middleware/auth.js";

const Route = express.Router();
const scrypt = promisify(scryptCallback);

const safeUser = (user) => ({
  _id: user._id,
  userName: user.userName,
  email: user.email,
  role: user.role,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const hashPassword = async (password) => {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${Buffer.from(derivedKey).toString("hex")}`;
};

const verifyPassword = async (password, storedPassword) => {
  if (storedPassword.startsWith("scrypt$")) {
    const [, salt, storedKey] = storedPassword.split("$");
    const derivedKey = Buffer.from(await scrypt(password, salt, 64));
    const expectedKey = Buffer.from(storedKey, "hex");
    return derivedKey.length === expectedKey.length && timingSafeEqual(derivedKey, expectedKey);
  }

  // Existing accounts use CryptoJS AES. Upgrade the password hash after a successful login.
  try {
    const legacyPassword = CryptoJS.AES.decrypt(storedPassword, process.env.crypto_key).toString(CryptoJS.enc.Utf8);
    return Boolean(legacyPassword) && legacyPassword === password;
  } catch {
    return false;
  }
};

const createSessionToken = (user) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not configured");
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    id: user._id.toString(),
    email: user.email,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
  })).toString("base64url");
  const signature = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
};

const issueSession = (user, res) => {
  res.cookie("nutriblog_session", createSessionToken(user), sessionCookieOptions());
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
    const user = await User.create({ userName, email, password: await hashPassword(password), role: "user" });
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
    if (!user || !(await verifyPassword(password, user.password))) {
      return res.status(401).json({ message: "Invalid email or password." });
    }
    if (!user.password.startsWith("scrypt$")) {
      user.password = await hashPassword(password);
      await user.save();
    }
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
    if (suppliedSecret.length !== bootstrapSecret.length || !timingSafeEqual(Buffer.from(suppliedSecret), Buffer.from(bootstrapSecret))) {
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
    sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
    path: "/",
  });
  return res.status(200).json({ message: "Logged out successfully." });
});

export default Route;
