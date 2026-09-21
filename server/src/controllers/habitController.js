import Habit from "../models/Habit.js";
import HabitLog from "../models/HabitLog.js";
import { NotFoundError, BadRequestError } from "../utils/errorClasses.js";
import { calculateStreaks, buildHeatMap, buildWeekStrip } from "../utils/streaks.js";
import { getRequestToday } from "../utils/dates.js";

// GET /api/v1/habits?includeArchived=false
export const listHabits = async (req, res, next) => {
  try {
    const includeArchived = req.query.includeArchived === "true";
    const filter = { user: req.user._id };
    if (!includeArchived) filter.isArchived = false;

    const today = getRequestToday(req);
    const habits = await Habit.find(filter).sort({ createdAt: -1 });

    // One query for ALL habits' logs (was one query per habit)
    const logs = await HabitLog.find({ user: req.user._id, habit: { $in: habits.map((h) => h._id) } }).select(
      "habit completedDate -_id"
    );
    const datesByHabit = new Map();
    for (const l of logs) {
      const key = l.habit.toString();
      if (!datesByHabit.has(key)) datesByHabit.set(key, []);
      datesByHabit.get(key).push(l.completedDate);
    }

    const habitsWithStreaks = habits.map((habit) => {
      const dates = datesByHabit.get(habit._id.toString()) || [];
      const week = buildWeekStrip(dates, today);
      return {
        ...habit.toObject(),
        streaks: {
          ...calculateStreaks(dates, today),
          week, // last 7 days [{ date, done }] for the weekly consistency dots
          weekCompletions: week.filter((d) => d.done).length,
        },
      };
    });

    res.json({ success: true, today, habits: habitsWithStreaks });
  } catch (err) {
    next(err);
  }
};

// GET /api/v1/habits/:id
export const getHabit = async (req, res, next) => {
  try {
    const habit = await Habit.findOne({ _id: req.params.id, user: req.user._id });
    if (!habit) throw new NotFoundError("Habit not found");

    const today = getRequestToday(req);
    const logs = await HabitLog.find({ habit: habit._id, user: req.user._id }).sort({ completedDate: -1 });
    const dates = logs.map((l) => l.completedDate);
    const streaks = calculateStreaks(dates, today);
    const heatMap = buildHeatMap(dates, 90, today);

    res.json({ success: true, habit, streaks, heatMap, logs });
  } catch (err) {
    next(err);
  }
};

// POST /api/v1/habits
export const createHabit = async (req, res, next) => {
  try {
    const { description, icon, color, category, targetFrequency } = req.body;
    const name = String(req.body.name ?? "").trim();
    if (!name) throw new BadRequestError("Habit name is required");

    const habit = await Habit.create({
      user: req.user._id,
      name,
      description,
      icon,
      color,
      category,
      targetFrequency,
    });
    res.status(201).json({ success: true, habit });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/v1/habits/:id
export const updateHabit = async (req, res, next) => {
  try {
    const habit = await Habit.findOne({ _id: req.params.id, user: req.user._id });
    if (!habit) throw new NotFoundError("Habit not found");

    const fields = ["name", "description", "icon", "color", "category", "targetFrequency"];
    fields.forEach((field) => {
      if (req.body[field] !== undefined) habit[field] = req.body[field];
    });
    await habit.save();
    res.json({ success: true, habit });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/v1/habits/:id/archive  (soft archive - keeps historical log data intact)
export const archiveHabit = async (req, res, next) => {
  try {
    const habit = await Habit.findOne({ _id: req.params.id, user: req.user._id });
    if (!habit) throw new NotFoundError("Habit not found");

    habit.isArchived = !habit.isArchived;
    habit.archivedAt = habit.isArchived ? new Date() : null;
    await habit.save();

    res.json({ success: true, habit });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/v1/habits/:id  (hard delete - also removes logs)
export const deleteHabit = async (req, res, next) => {
  try {
    const habit = await Habit.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!habit) throw new NotFoundError("Habit not found");

    await HabitLog.deleteMany({ habit: habit._id, user: req.user._id });
    res.json({ success: true, message: "Habit deleted" });
  } catch (err) {
    next(err);
  }
};
