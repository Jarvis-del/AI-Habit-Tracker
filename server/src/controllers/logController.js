import HabitLog from "../models/HabitLog.js";
import Habit from "../models/Habit.js";
import { NotFoundError, BadRequestError } from "../utils/errorClasses.js";
import { getRequestToday, isValidYmd, shiftDate, lastNDates } from "../utils/dates.js";

// POST /api/v1/logs/toggle  { habitId, date? }
// Toggles today's (or a given date's) completion for a habit - checks it off if
// not yet done, un-checks it if already done. Backed by a unique compound index
// on (user, habit, completedDate) so a date can never be recorded twice.
export const toggleCompletion = async (req, res, next) => {
  try {
    const { habitId, date, note } = req.body;
    if (!habitId) throw new BadRequestError("habitId is required");

    const habit = await Habit.findOne({ _id: habitId, user: req.user._id });
    if (!habit) throw new NotFoundError("Habit not found");

    const today = getRequestToday(req);
    const completedDate = date || today;
    if (!isValidYmd(completedDate)) throw new BadRequestError("date must be a valid YYYY-MM-DD string");
    // allow +1 day of slack for users ahead of the server's clock, but no logging the future
    if (completedDate > shiftDate(today, 1)) throw new BadRequestError("You can't log a habit for a future date");

    const existing = await HabitLog.findOne({
      user: req.user._id,
      habit: habitId,
      completedDate,
    });

    if (existing) {
      await existing.deleteOne();
      return res.json({ success: true, completed: false, completedDate });
    }

    let log;
    try {
      log = await HabitLog.create({
        user: req.user._id,
        habit: habitId,
        completedDate,
        note: note || "",
      });
    } catch (err) {
      // Double-click / two tabs raced past the findOne above: the unique index caught it.
      if (err.code === 11000) return res.json({ success: true, completed: true, completedDate });
      throw err;
    }

    res.status(201).json({ success: true, completed: true, completedDate, log });
  } catch (err) {
    next(err);
  }
};

// GET /api/v1/logs?habitId=&from=&to=
export const getLogs = async (req, res, next) => {
  try {
    const { habitId, from, to } = req.query;
    const filter = { user: req.user._id };
    if (habitId) filter.habit = habitId;
    if (from || to) {
      filter.completedDate = {};
      if (from) filter.completedDate.$gte = from;
      if (to) filter.completedDate.$lte = to;
    }
    const logs = await HabitLog.find(filter).sort({ completedDate: -1 });
    res.json({ success: true, logs });
  } catch (err) {
    next(err);
  }
};

// GET /api/v1/logs/weekly-summary
// Returns, per habit: completions this week (last 7 days), the previous 7 days (for the
// week-over-week comparison chart) and a 7-day daily array (for the consistency grid).
export const getWeeklySummary = async (req, res, next) => {
  try {
    const today = getRequestToday(req);
    const dates = lastNDates(7, today);
    const prevDates = lastNDates(7, shiftDate(today, -7));
    const sevenDaysAgo = dates[0];
    const fourteenDaysAgo = prevDates[0];

    const habits = await Habit.find({ user: req.user._id, isArchived: false });
    const logs = await HabitLog.find({
      user: req.user._id,
      habit: { $in: habits.map((h) => h._id) },
      completedDate: { $gte: fourteenDaysAgo, $lte: today },
    });

    const summary = habits.map((habit) => {
      const habitDates = new Set(logs.filter((l) => l.habit.toString() === habit._id.toString()).map((l) => l.completedDate));
      const daily = dates.map((d) => habitDates.has(d));
      const completions = daily.filter(Boolean).length;
      const previousCompletions = prevDates.filter((d) => habitDates.has(d)).length;
      const target = habit.targetFrequency?.type === "weekly" ? habit.targetFrequency.timesPerWeek : 7;
      return {
        habitId: habit._id,
        name: habit.name,
        category: habit.category,
        color: habit.color,
        completions,
        previousCompletions,
        daily,
        target,
        completionRate: Math.min(1, completions / target),
      };
    });

    res.json({ success: true, from: sevenDaysAgo, to: today, dates, summary });
  } catch (err) {
    next(err);
  }
};
