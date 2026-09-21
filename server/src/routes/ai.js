import express from "express";
import {
  getMorningBanner,
  suggestHabits,
  getStreakRecovery,
  getStreakRecoveryAll,
  getWeeklyReport,
  chatWithData,
} from "../controllers/aiController.js";
import { protect } from "../middlewares/auth.js";
import { rateLimiter } from "../middlewares/rateLimiter.js";
import { validate } from "../middlewares/validate.js";

const router = express.Router();

router.use(protect);
// AI routes hit the Gemini API, so they get a tighter limit than the rest of the app.
// It has its OWN counter (keyed per user) and only counts AI calls.
router.use(
  rateLimiter({
    windowMs: 60_000,
    max: 30,
    keyGenerator: (req) => `ai:${req.user?._id || req.ip}`,
    message: "You're using the AI features very quickly.",
  })
);

router.get("/morning-banner", getMorningBanner);
router.post("/suggest-habits", validate(["goals"]), suggestHabits);
router.get("/streak-recovery", getStreakRecoveryAll);
router.get("/streak-recovery/:habitId", getStreakRecovery);
router.get("/weekly-report", getWeeklyReport);
router.post("/chat", validate(["message"]), chatWithData);

export default router;
