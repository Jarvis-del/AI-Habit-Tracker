import { useState, useEffect } from "react";
import confetti from "canvas-confetti";
import { format, parseISO } from "date-fns";
import { Flame, Trophy, Archive, Trash2, MoreVertical } from "lucide-react";
import { habitService } from "../services/habitService.js";
import { getHabitIcon } from "../utils/constants.js";
import { getErrorMessage } from "../utils/errors.js";
import CompletionRing from "./CompletionRing.jsx";

const COLORS = ["#7c3aed", "#06b6d4", "#ec4899", "#22c55e", "#f97316"];

function fireConfetti(big = false) {
  confetti({
    particleCount: big ? 220 : 80,
    spread: big ? 110 : 70,
    startVelocity: big ? 45 : 35,
    origin: { y: 0.7 },
    colors: COLORS,
    disableForReducedMotion: true,
  });
}

export default function HabitChecklist({ habits, onRefresh, pendingIds, onToggleHabit }) {
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [error, setError] = useState("");

  // click-away closes the ⋮ menu
  useEffect(() => {
    if (!menuOpenId) return;
    const close = () => setMenuOpenId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menuOpenId]);

  const handleArchive = async (habitId) => {
    try {
      await habitService.archive(habitId);
      setMenuOpenId(null);
      onRefresh();
    } catch (err) {
      setError(getErrorMessage(err, "Could not archive habit"));
    }
  };

  const handleDelete = async (habitId) => {
    if (!confirm("Delete this habit permanently? This also removes its history.")) return;
    try {
      await habitService.remove(habitId);
      setMenuOpenId(null);
      onRefresh();
    } catch (err) {
      setError(getErrorMessage(err, "Could not delete habit"));
    }
  };

  if (habits.length === 0) {
    return (
      <div className="glass rounded-3xl p-10 text-center">
        <p className="font-display text-lg font-semibold">No habits yet</p>
        <p className="mt-1 text-sm opacity-70">Add your first habit — or let the AI suggest some — to start building momentum.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {error && <p className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-500">{error}</p>}

      {habits.map((habit) => {
        const Icon = getHabitIcon(habit.icon);
        const completedToday = !!habit.streaks?.completedToday;
        const target = habit.targetFrequency?.type === "weekly" ? habit.targetFrequency.timesPerWeek || 7 : 7;
        const weekDone = habit.streaks?.weekCompletions || 0;
        const week = habit.streaks?.week || [];
        const pending = pendingIds.has(habit._id);

        return (
          <div key={habit._id} className="glass fade-in flex items-center gap-4 rounded-2xl p-4 transition hover:-translate-y-0.5">
            {/* weekly progress ring wrapped around the check-off button */}
            <CompletionRing
              value={weekDone / target}
              size={60}
              stroke={4}
              color={habit.color}
              label={`${weekDone} of ${target} days this week`}
            >
              <button
                onClick={() => onToggleHabit(habit)}
                disabled={pending}
                aria-pressed={completedToday}
                aria-label={`Mark ${habit.name} ${completedToday ? "incomplete" : "complete"} for today`}
                className="grid h-11 w-11 place-items-center rounded-full border-2 transition-all hover:scale-105 disabled:opacity-60"
                style={{
                  borderColor: habit.color,
                  background: completedToday ? habit.color : "transparent",
                  color: completedToday ? "white" : habit.color,
                }}
              >
                <Icon size={19} />
              </button>
            </CompletionRing>

            <div className="min-w-0 flex-1">
              <p className="truncate font-display font-semibold">{habit.name}</p>
              <div className="mt-0.5 flex items-center gap-3 text-xs opacity-70">
                <span className="flex items-center gap-1">
                  <Flame size={12} /> {habit.streaks?.currentStreak || 0} day streak
                </span>
                <span className="flex items-center gap-1">
                  <Trophy size={12} /> best {habit.streaks?.longestStreak || 0}
                </span>
              </div>

              {/* weekly consistency dots: last 7 days, oldest -> today */}
              <div className="mt-2 flex gap-1.5" aria-label="Last 7 days">
                {week.map((d, i) => (
                  <div key={d.date} className="flex flex-col items-center gap-0.5" title={`${format(parseISO(d.date), "EEE, MMM d")}: ${d.done ? "done" : "missed"}`}>
                    <span className="text-[9px] leading-none opacity-50">{format(parseISO(d.date), "EEEEE")}</span>
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{
                        background: d.done ? habit.color : "var(--track)",
                        outline: i === week.length - 1 ? `1.5px solid ${habit.color}` : "none",
                        outlineOffset: 1.5,
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => setMenuOpenId(menuOpenId === habit._id ? null : habit._id)}
                aria-label="Habit options"
                className="grid h-9 w-9 place-items-center rounded-xl opacity-60 hover:bg-white/20 hover:opacity-100"
              >
                <MoreVertical size={16} />
              </button>
              {menuOpenId === habit._id && (
                <div className="glass absolute right-0 top-11 z-10 w-40 overflow-hidden rounded-xl py-1 text-sm">
                  <button onClick={() => handleArchive(habit._id)} className="flex w-full items-center gap-2 px-3 py-2 hover:bg-white/20">
                    <Archive size={14} /> Archive
                  </button>
                  <button onClick={() => handleDelete(habit._id)} className="flex w-full items-center gap-2 px-3 py-2 text-red-500 hover:bg-white/20">
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export { fireConfetti };
