import {
  Star, Footprints, BookOpen, Brain, Droplet, MoonStar, PenLine, Dumbbell, Heart, Sun, Coffee, Music,
  Target, Users, Leaf, Bike, Apple, Sparkles,
} from "lucide-react";

export const CATEGORIES = [
  { value: "health", label: "Health" },
  { value: "fitness", label: "Fitness" },
  { value: "mindfulness", label: "Mindfulness" },
  { value: "productivity", label: "Productivity" },
  { value: "learning", label: "Learning" },
  { value: "social", label: "Social" },
  { value: "other", label: "Other" },
];

// Explicit icon map (instead of `import * as Icons from "lucide-react"`, which pulled every one
// of lucide's ~1,400 icons into the bundle and made it 1.6 MB).
export const ICON_MAP = {
  Star, Footprints, BookOpen, Brain, Droplet, MoonStar, PenLine, Dumbbell, Heart, Sun, Coffee, Music,
  Target, Users, Leaf, Bike, Apple, Sparkles,
};
export const ICON_OPTIONS = Object.keys(ICON_MAP);
export const getHabitIcon = (name) => ICON_MAP[name] || Star;

export const COLOR_OPTIONS = ["#7c3aed", "#6366f1", "#06b6d4", "#f97316", "#ec4899", "#22c55e", "#eab308"];

// Sensible icon/colour for AI-suggested habits, based on their category
export const CATEGORY_DEFAULTS = {
  health: { icon: "Heart", color: "#06b6d4" },
  fitness: { icon: "Dumbbell", color: "#f97316" },
  mindfulness: { icon: "Brain", color: "#8b5cf6" },
  productivity: { icon: "Target", color: "#6366f1" },
  learning: { icon: "BookOpen", color: "#22c55e" },
  social: { icon: "Users", color: "#ec4899" },
  other: { icon: "Star", color: "#7c3aed" },
};

export const CATEGORY_COLORS = {
  health: "#06b6d4",
  fitness: "#f97316",
  mindfulness: "#8b5cf6",
  productivity: "#6366f1",
  learning: "#22c55e",
  social: "#ec4899",
  other: "#94a3b8",
};
