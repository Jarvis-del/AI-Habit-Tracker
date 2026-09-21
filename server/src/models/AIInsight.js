import mongoose from "mongoose";

// Caches generated AI responses so we don't hit the Gemini API more than necessary
const aiInsightSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: {
      type: String,
      enum: ["morning_motivation", "weekly_report", "streak_recovery", "chat", "habit_suggestion"],
      required: true,
    },
    habit: { type: mongoose.Schema.Types.ObjectId, ref: "Habit", default: null }, // relevant for streak_recovery
    content: { type: String, required: true }, // the generated text/markdown
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }, // e.g. { weekOf: '2026-08-17' }
    // used to key cache lookups, e.g. `weekly_report:2026-08-17` or `streak_recovery:<habitId>`
    cacheKey: { type: String, required: true, index: true },
  },
  { timestamps: true }
);

aiInsightSchema.index({ user: 1, cacheKey: 1 }, { unique: true });

export default mongoose.model("AIInsight", aiInsightSchema);
