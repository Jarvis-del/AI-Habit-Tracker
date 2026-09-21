import mongoose from "mongoose";

const habitLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    habit: { type: mongoose.Schema.Types.ObjectId, ref: "Habit", required: true, index: true },
    // Stored as YYYY-MM-DD string (not a Date) to avoid timezone bugs and simplify queries
    completedDate: { type: String, required: true },
    note: { type: String, default: "" },
  },
  { timestamps: true }
);

// Prevent duplicate completions for the same habit on the same day
habitLogSchema.index({ user: 1, habit: 1, completedDate: 1 }, { unique: true });

export default mongoose.model("HabitLog", habitLogSchema);
