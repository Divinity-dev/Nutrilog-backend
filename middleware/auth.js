import jwt from "jsonwebtoken";

export const authenticate = (req, res, next) => {
  const token = req.cookies?.nutriblog_session;
  if (!token) return res.status(401).json({ message: "Authentication required" });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ message: "Session expired. Please log in again." });
  }
};

export const requireAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "Administrator access required" });
  }
  return next();
};

export const sessionCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1000,
});
