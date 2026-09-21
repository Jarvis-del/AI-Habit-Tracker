// Standalone database seeding script.
// Populates one demo user with several habits and ~500 realistic completion
// records spread over the last 90 days, so the UI (streaks, heat map, charts)
// has real-looking data to render immediately.
//
// Usage: npm run seed   (from the /server directory)

import "dotenv/config";

import mongoose from "mongoose";
import { format, subDays } from "date-fns";
import { connectDB } from "../src/config/db.js";
import User from "../src/models/User.js";
import Habit from "../src/models/Habit.js";
import HabitLog from "../src/models/HabitLog.js";
import { logger } from "../src/utils/logger.js";

const DEMO_EMAIL = "demo@habittracker.app";

const HABITS = [
  { name: "Morning Run", icon: "Footprints", color: "#f97316", category: "fitness", completionChance: 0.75 },
  { name: "Read 20 Pages", icon: "BookOpen", color: "#6366f1", category: "learning", completionChance: 0.65 },
  { name: "Meditate", icon: "Brain", color: "#8b5cf6", category: "mindfulness", completionChance: 0.55 },
  { name: "Drink 8 Glasses of Water", icon: "Droplet", color: "#06b6d4", category: "health", completionChance: 0.85 },
  { name: "No Phone Before Bed", icon: "MoonStar", color: "#0ea5e9", category: "health", completionChance: 0.4 },
  { name: "Journal", icon: "PenLine", color: "#ec4899", category: "mindfulness", completionChance: 0.6 },
  // Deliberately has a 12-day streak that ENDED 3 days ago, so the AI Streak Recovery Coach
  // triggers immediately on the demo account.
  { name: "Evening Stretch", icon: "Heart", color: "#22c55e", category: "health", brokenStreak: { endedDaysAgo: 3, length: 12 } },
];

async function seed() {
  await connectDB();

  // Reset demo user's data for idempotent re-runs
  const existingUser = await User.findOne({ email: DEMO_EMAIL });
  if (existingUser) {
    await Habit.deleteMany({ user: existingUser._id });
    await HabitLog.deleteMany({ user: existingUser._id });
    await existingUser.deleteOne();
    logger.info("Cleared existing demo user data");
  }

  const user = await User.create({
    name: "Demo User",
    email: DEMO_EMAIL,
    password: "password123", // hashed automatically via pre-save hook
  });
  logger.info(`Created demo user: ${user.email} (password: password123)`);

  const createdHabits = await Habit.insertMany(
    HABITS.map((h) => ({
      user: user._id,
      name: h.name,
      icon: h.icon,
      color: h.color,
      category: h.category,
      targetFrequency: { type: "daily", timesPerWeek: 7 },
    }))
  );

  const logsToInsert = [];
  const DAYS = 90;

  for (let dayOffset = DAYS - 1; dayOffset >= 0; dayOffset--) {
    const date = format(subDays(new Date(), dayOffset), "yyyy-MM-dd");

    createdHabits.forEach((habit, idx) => {
      const cfg = HABITS[idx];
      if (cfg.brokenStreak) {
        const { endedDaysAgo, length } = cfg.brokenStreak;
        if (dayOffset >= endedDaysAgo && dayOffset < endedDaysAgo + length) {
          logsToInsert.push({ user: user._id, habit: habit._id, completedDate: date });
        }
        return;
      }
      const chance = cfg.completionChance;
      // Bias toward more consistency in the most recent 14 days, to make current streaks look realistic
      const recencyBoost = dayOffset < 14 ? 0.15 : 0;
      if (Math.random() < chance + recencyBoost) {
        logsToInsert.push({
          user: user._id,
          habit: habit._id,
          completedDate: date,
        });
      }
    });
  }

  // insertMany with ordered:false so a rare duplicate-key collision doesn't halt the whole batch
  const result = await HabitLog.insertMany(logsToInsert, { ordered: false }).catch((err) => {
    // ignore duplicate key errors from the unique compound index, log anything else
    if (err.code !== 11000) logger.warn("Seed insert warning:", err.message);
    return err.insertedDocs || [];
  });

  logger.info(`Seeded ${createdHabits.length} habits and ~${logsToInsert.length} completion logs`);
  logger.info("Done. You can now log in with demo@habittracker.app / password123");

  await mongoose.connection.close();
  process.exit(0);
}

seed().catch((err) => {
  logger.error("Seeding failed:", err);
  process.exit(1);
});
