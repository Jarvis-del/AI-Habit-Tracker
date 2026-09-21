import jwt from "jsonwebtoken";
import crypto from "node:crypto";

// Access token: short-lived JWT, sent in the Authorization header and kept in memory by the client.
export const generateToken = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: process.env.ACCESS_TOKEN_TTL || "15m",
  });

// Refresh token: opaque random string (NOT a JWT), delivered only via an httpOnly cookie.
export const generateRefreshToken = () => crypto.randomBytes(48).toString("base64url");
export const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");
export const newFamilyId = () => crypto.randomUUID();

export const REFRESH_COOKIE = "momentum_rt";
export const REFRESH_TTL_DAYS = () => Number(process.env.REFRESH_TOKEN_TTL_DAYS) || 7;

export const refreshCookieOptions = () => {
  const sameSite = (process.env.COOKIE_SAMESITE || "lax").toLowerCase(); // lax | strict | none
  return {
    httpOnly: true, // JavaScript can never read it -> XSS can't steal the session
    secure: process.env.NODE_ENV === "production" || sameSite === "none",
    sameSite,
    path: "/api/v1/auth", // only ever sent to the auth endpoints
    maxAge: REFRESH_TTL_DAYS() * 24 * 60 * 60 * 1000,
  };
};
