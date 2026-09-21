import express from "express";
import {
  listHabits,
  getHabit,
  createHabit,
  updateHabit,
  archiveHabit,
  deleteHabit,
} from "../controllers/habitController.js";
import { protect } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";

const router = express.Router();

router.use(protect); // every habit route requires auth

router.get("/", listHabits);
router.post("/", validate(["name"]), createHabit);
router.get("/:id", getHabit);
router.patch("/:id", updateHabit);
router.patch("/:id/archive", archiveHabit);
router.delete("/:id", deleteHabit);

export default router;
