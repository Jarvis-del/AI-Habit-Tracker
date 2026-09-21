import { useState, useCallback } from "react";
import { Plus, Wand2, Flame, CheckCircle2 } from "lucide-react";
import { useHabits } from "../hooks/useHabits.js";
import { useAuth } from "../context/AuthContext.jsx";
import HabitChecklist, { fireConfetti } from "../components/HabitChecklist.jsx";
import HabitForm from "../components/HabitForm.jsx";
import AIWizard from "../components/AIWizard.jsx";
import MorningBanner from "../components/MorningBanner.jsx";
import StreakRecovery from "../components/StreakRecovery.jsx";
import OrbitSystem from "../components/OrbitSystem.jsx";
import AIChat from "../components/AIChat.jsx";
import { getErrorMessage } from "../utils/errors.js";

export default function Dashboard() {
  const { user } = useAuth();
  const { habits, loading, error, refresh, toggleToday } = useHabits();
  const [showForm, setShowForm] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [pendingIds, setPendingIds] = useState(() => new Set());
  const [toggleError, setToggleError] = useState("");

  // Shared by the checklist buttons AND the orbiting planets
  const handleToggle = useCallback(
    async (habit) => {
      if (pendingIds.has(habit._id)) return; // ignore double-clicks while a request is in flight
      setPendingIds((p) => new Set(p).add(habit._id));
      setToggleError("");
      try {
        const result = await toggleToday(habit._id);
        if (result?.completed) {
          const everythingDone = habits.every((h) => h._id === habit._id || h.streaks?.completedToday);
          fireConfetti(everythingDone && habits.length > 1);
        }
      } catch (err) {
        setToggleError(getErrorMessage(err, "Couldn't update that habit."));
      } finally {
        setPendingIds((p) => {
          const n = new Set(p);
          n.delete(habit._id);
          return n;
        });
      }
    },
    [habits, pendingIds, toggleToday]
  );

  const doneCount = habits.filter((h) => h.streaks?.completedToday).length;
  const bestStreak = Math.max(0, ...habits.map((h) => h.streaks?.currentStreak || 0));

  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-6 md:px-8">
      <MorningBanner />
      <StreakRecovery habits={habits} />

      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Hey {user?.name?.split(" ")[0]} 👋</h1>
          <p className="text-sm opacity-70">
            {habits.length} active habit{habits.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowWizard(true)} className="glass flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium">
            <Wand2 size={16} className="text-violet-500" />
            <span className="hidden sm:inline">Suggest habits</span>
          </button>
          <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-3 py-2 text-sm font-medium text-white">
            <Plus size={16} />
            <span className="hidden sm:inline">New habit</span>
          </button>
        </div>
      </div>

      {error && <p role="alert" className="mb-4 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-500">{error}</p>}
      {toggleError && <p role="alert" className="mb-4 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-500">{toggleError}</p>}

      {habits.length > 0 && (
        <section className="glass fade-in mb-6 flex flex-col items-center gap-4 rounded-3xl p-5 sm:flex-row sm:gap-8">
          <OrbitSystem habits={habits} onToggle={handleToggle} busyIds={pendingIds} />
          <div className="text-center sm:text-left">
            <p className="text-xs font-medium uppercase tracking-wide opacity-60">Your habit solar system</p>
            <p className="mt-1 font-display text-3xl font-bold">
              {doneCount}/{habits.length} <span className="text-base font-medium opacity-70">done today</span>
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-3 text-sm sm:justify-start">
              <span className="flex items-center gap-1.5 rounded-full bg-[var(--track)] px-3 py-1">
                <Flame size={14} className="text-orange-500" /> best current streak: {bestStreak}
              </span>
              <span className="flex items-center gap-1.5 rounded-full bg-[var(--track)] px-3 py-1">
                <CheckCircle2 size={14} className="text-emerald-500" /> {habits.length - doneCount} to go
              </span>
            </div>
            <p className="mt-3 text-xs opacity-60">Each planet is a habit. Hover to pause the orbit, then click a planet to check it off.</p>
          </div>
        </section>
      )}

      {loading ? (
        <div className="glass rounded-3xl p-10 text-center opacity-70">Loading habits…</div>
      ) : (
        <HabitChecklist habits={habits} onRefresh={refresh} pendingIds={pendingIds} onToggleHabit={handleToggle} />
      )}

      {showForm && <HabitForm onClose={() => setShowForm(false)} onCreated={refresh} />}
      {showWizard && <AIWizard onClose={() => setShowWizard(false)} onHabitAdded={refresh} />}

      <AIChat />
    </div>
  );
}
