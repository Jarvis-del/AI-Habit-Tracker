import express from "express";
import {
  register,
  login,
  refresh,
  logout,
  logoutAll,
  changePassword,
  getMe,
  updateSettings,
} from "../controllers/authController.js";
import { protect } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { rateLimiter } from "../middlewares/rateLimiter.js";
import { ApiError } from "../utils/errorClasses.js";

const router = express.Router();

// Brute-force protection. Login counts only FAILED attempts, so normal use never locks you out:
//  - per IP+email: stops guessing one account's password
//  - per IP: stops one machine trying many accounts (credential stuffing)
const loginByAccount = rateLimiter({
  windowMs: 15 * 60_000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX) || 10,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `login:${req.ip}:${String(req.body?.email ?? "").toLowerCase()}`,
  message: "Too many failed login attempts.",
});
const loginByIp = rateLimiter({
  windowMs: 15 * 60_000,
  max: (Number(process.env.AUTH_RATE_LIMIT_MAX) || 10) * 5,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `login-ip:${req.ip}`,
  message: "Too many failed login attempts from this network.",
});
const registerLimiter = rateLimiter({
  windowMs: 60 * 60_000,
  max: Number(process.env.REGISTER_RATE_LIMIT_MAX) || 20,
  keyGenerator: (req) => `register:${req.ip}`,
  message: "Too many sign-ups from this network.",
});

// CSRF defence for the two cookie-authenticated endpoints. A custom header can only be sent by
// our own JavaScript: another website can't add it without a CORS preflight that we refuse.
// (Together with the SameSite cookie attribute this blocks cross-site request forgery.)
const requireCustomHeader = (req, res, next) => {
  if (req.get("x-requested-with") !== "XMLHttpRequest") {
    return next(new ApiError(403, "Missing X-Requested-With header"));
  }
  next();
};

router.post("/register", registerLimiter, validate(["name", "email", "password"]), register);
router.post("/login", loginByIp, loginByAccount, validate(["email", "password"]), login);
router.post("/refresh", requireCustomHeader, refresh);
router.post("/logout", requireCustomHeader, logout);
router.post("/logout-all", protect, logoutAll);
router.post("/change-password", protect, validate(["currentPassword", "newPassword"]), changePassword);
router.get("/me", protect, getMe);
router.patch("/settings", protect, updateSettings);

export default router;
