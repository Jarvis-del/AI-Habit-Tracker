import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { LifeBuoy, X } from "lucide-react";
import { aiService } from "../services/aiService.js";
import { getErrorMessage } from "../utils/errors.js";

// Detects a recently broken 7+ day streak (server-side, one request for ALL habits) and shows
// a dismissible AI-written 3-day comeback plan.
export default function StreakRecovery({ habits }) {
  const [plans, setPlans] = useState([]);
  const [error, setError] = useState("");
  const [dismissed, setDismissed] = useState(() => new Set());

  // Re-check only when something that can change a *broken* streak changes. Habits whose last
  // completion is today/yesterday are "live" (their exact date is irrelevant), so ordinary
  // check-offs on them no longer trigger any request.
  const key = useMemo(
    () =>
      habits
        .map((h) => {
          const week = h.streaks?.week || [];
          const recent = new Set(week.slice(-2).map((d) => d.date)); // yesterday + today
          const last = h.streaks?.lastCompletedDate;
          return `${h._id}:${last && !recent.has(last) ? last : "live"}`;
        })
        .join("|"),
    [habits]
  );

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    aiService
      .streakRecovery()
      .then((res) => {
        if (cancelled) return;
        setError("");
        setPlans(res.triggered ? res.plans || [] : []);
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, "Couldn't load your comeback plan."));
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const visible = plans.filter((p) => !dismissed.has(p.habitId));

  if (error && plans.length === 0) {
    return (
      <div role="alert" className="glass mb-6 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4 text-sm">
        <span className="font-medium">Comeback plan unavailable:</span> <span className="opacity-80">{error}</span>
      </div>
    );
  }
  if (visible.length === 0) return null;

  return (
    <>
      {visible.map((plan) => (
        <div key={plan.habitId} className="glass fade-in mb-6 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-5">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 font-display font-semibold text-amber-600 dark:text-amber-300">
              <LifeBuoy size={18} />
              Comeback plan for "{plan.habitName}"
              <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-xs font-medium">{plan.brokenStreakLength}-day streak lost</span>
            </div>
            <button
              onClick={() => setDismissed((d) => new Set(d).add(plan.habitId))}
              aria-label="Dismiss"
              className="opacity-60 hover:opacity-100"
            >
              <X size={18} />
            </button>
          </div>
          <div className="md-content text-sm opacity-90">
            <ReactMarkdown>{plan.plan}</ReactMarkdown>
          </div>
        </div>
      ))}
    </>
  );
}
