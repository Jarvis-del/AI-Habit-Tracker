import mongoose from "mongoose";

const habitSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    icon: { type: String, default: "Star" }, // lucide-react icon name
    color: { type: String, default: "#6366f1" }, // hex color for UI theming
    category: {
      type: String,
      enum: ["health", "fitness", "mindfulness", "productivity", "learning", "social", "other"],
      default: "other",
    },
    targetFrequency: {
      type: { type: String, enum: ["daily", "weekly"], default: "daily" },
      timesPerWeek: { type: Number, default: 7 }, // used when type is "weekly"
    },
    isArchived: { type: Boolean, default: false }, // soft archive - keeps history intact
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

habitSchema.index({ user: 1, isArchived: 1 });

export default mongoose.model("Habit", habitSchema);
