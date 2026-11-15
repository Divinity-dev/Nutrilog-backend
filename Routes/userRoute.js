import User from "../models/user.js";
import express from "express";
import CryptoJS from "crypto-js";
import { createHmac, randomBytes, randomInt, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { authenticate, sessionCookieOptions } from "../middleware/auth.js";
import { sendEmail } from "../utils/mail.js";

const Route = express.Router();
const scrypt = promisify(scryptCallback);
const RESET_CODE_TTL_MS = 10 * 60 * 1000;
const RESET_REQUEST_COOLDOWN_MS = 60 * 1000;
const MAX_RESET_ATTEMPTS = 5;

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

const createResetCodeHash = (email, code) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not configured");
  return createHmac("sha256", secret).update(`${email}:${code}`).digest("hex");
};

const safeCompare = (left, right) => {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
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

// Always returns the same public response so callers cannot discover registered email addresses.
Route.post("/forgot-password", async (req, res) => {
  const genericResponse = {
    message: "If an account exists for that email, a password reset code will be sent shortly.",
  };

  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !process.env.JWT_SECRET) {
      return res.status(200).json(genericResponse);
    }

    const user = await User.findOne({ email }).select("+resetPasswordRequestedAt");
    if (!user) return res.status(200).json(genericResponse);

    const now = Date.now();
    if (user.resetPasswordRequestedAt && now - user.resetPasswordRequestedAt.getTime() < RESET_REQUEST_COOLDOWN_MS) {
      return res.status(200).json(genericResponse);
    }

    const code = String(randomInt(100000, 1000000));
    user.resetPasswordCodeHash = createResetCodeHash(email, code);
    user.resetPasswordExpires = new Date(now + RESET_CODE_TTL_MS);
    user.resetPasswordRequestedAt = new Date(now);
    user.resetPasswordAttempts = 0;
    await user.save();

    try {
      await sendEmail({
        from: process.env.SMTP_USER ? `NutriBlogHub <${process.env.SMTP_USER}>` : undefined,
        to: user.email,
        subject: "Your NutriBlogHub password reset code",
        text: `Your NutriBlogHub password reset code is ${code}. It expires in 10 minutes. If you did not request this, you can ignore this email.`,
        html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px;color:#222"><h2 style="color:#c2410c">Reset your NutriBlogHub password</h2><p>Use this one-time verification code to reset your password:</p><p style="font-size:30px;font-weight:700;letter-spacing:8px;color:#c2410c">${code}</p><p>This code expires in 10 minutes and can only be used once.</p><p>If you did not request a password reset, you can safely ignore this email.</p></div>`,
      });
    } catch (emailError) {
      console.error("NutriBlogHub password reset email failed:", emailError?.message || "Unknown SMTP error");
      user.resetPasswordCodeHash = undefined;
      user.resetPasswordExpires = undefined;
      user.resetPasswordRequestedAt = undefined;
      user.resetPasswordAttempts = 0;
      await user.save();
    }

    return res.status(200).json(genericResponse);
  } catch (error) {
    console.error("NutriBlogHub forgot-password request failed:", error?.message || "Unknown error");
    return res.status(200).json(genericResponse);
  }
});

Route.post("/reset-password", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const code = String(req.body.code || "").trim();
    const password = String(req.body.password || "");

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ message: "Enter a valid email address and the 6-digit code." });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: "Your new password must be at least 8 characters." });
    }
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: "Password reset is not configured on the server." });
    }

    const user = await User.findOne({
      email,
      resetPasswordExpires: { $gt: new Date() },
      resetPasswordAttempts: { $lt: MAX_RESET_ATTEMPTS },
      resetPasswordCodeHash: { $exists: true },
    }).select("+resetPasswordCodeHash +resetPasswordExpires +resetPasswordAttempts");

    if (!user) {
      return res.status(400).json({ message: "The code is invalid or has expired. Please request a new code." });
    }

    const submittedHash = createResetCodeHash(email, code);
    if (!safeCompare(submittedHash, user.resetPasswordCodeHash)) {
      user.resetPasswordAttempts = (user.resetPasswordAttempts || 0) + 1;
      await user.save();
      return res.status(400).json({ message: "The code is invalid or has expired. Please request a new code." });
    }

    user.password = await hashPassword(password);
    user.resetPasswordCodeHash = undefined;
    user.resetPasswordExpires = undefined;
    user.resetPasswordRequestedAt = undefined;
    user.resetPasswordAttempts = 0;
    await user.save();

    return res.status(200).json({ message: "Your password has been reset. You can now log in with your new password." });
  } catch {
    return res.status(500).json({ message: "Unable to reset your password. Please try again." });
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
