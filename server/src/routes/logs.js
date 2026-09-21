import express from "express";
import { toggleCompletion, getLogs, getWeeklySummary } from "../controllers/logController.js";
import { protect } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";

const router = express.Router();

router.use(protect);

router.post("/toggle", validate(["habitId"]), toggleCompletion);
router.get("/", getLogs);
router.get("/weekly-summary", getWeeklySummary);

export default router;
