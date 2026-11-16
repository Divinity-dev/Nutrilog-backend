import { createHmac, timingSafeEqual } from "node:crypto";

const readCookie = (header, name) => {
  const entry = (header || "").split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : null;
};

const verifyToken = (token) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT secret is not configured");
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid token");
  const data = `${parts[0]}.${parts[1]}`;
  const expected = createHmac("sha256", secret).update(data).digest("base64url");
  const actualBuffer = Buffer.from(parts[2]);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    throw new Error("Invalid token signature");
  }
  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) throw new Error("Expired token");
  return payload;
};

export const authenticate = (req, res, next) => {
  try {
    const token = readCookie(req.headers.cookie, "nutriblog_session");
    if (!token) return res.status(401).json({ message: "Authentication required" });
    req.user = verifyToken(token);
    return next();
  } catch {
    return res.status(401).json({ message: "Session expired. Please log in again." });
  }
};

export const optionalAuthenticate = (req, _res, next) => {
  try {
    const token = readCookie(req.headers.cookie, "nutriblog_session");
    if (token) req.user = verifyToken(token);
  } catch {
    req.user = null;
  }
  return next();
};

export const requireAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") return res.status(403).json({ message: "Administrator access required" });
  return next();
};

export const sessionCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1000,
});
