import { useState } from "react";
import { X, Wand2, ArrowRight, ArrowLeft, Plus, Check, Clock } from "lucide-react";
import { aiService } from "../services/aiService.js";
import { habitService } from "../services/habitService.js";
import { CATEGORY_DEFAULTS } from "../utils/constants.js";
import { getErrorMessage } from "../utils/errors.js";

const STEPS = ["goals", "energy", "struggles"];

export default function AIWizard({ onClose, onHabitAdded }) {
  const [step, setStep] = useState(0);
  const [goals, setGoals] = useState("");
  const [peakEnergyTime, setPeakEnergyTime] = useState("");
  const [pastStruggles, setPastStruggles] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState(null);
  const [added, setAdded] = useState(() => new Set());
  const [adding, setAdding] = useState(null);
  const [error, setError] = useState("");

  const next = async (e) => {
    e?.preventDefault();
    if (step === 0 && !goals.trim()) return;
    if (step < STEPS.length - 1) {
      setStep(step + 1);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { suggestions } = await aiService.suggestHabits({ goals, peakEnergyTime, pastStruggles });
      setSuggestions(suggestions || []);
      setAdded(new Set());
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't generate suggestions. Try again."));
    } finally {
      setLoading(false);
    }
  };

  const addSuggestion = async (s, i) => {
    if (adding !== null || added.has(i)) return;
    setAdding(i);
    setError("");
    try {
      const defaults = CATEGORY_DEFAULTS[s.category] || CATEGORY_DEFAULTS.other;
      await habitService.create({
        name: s.name,
        description: s.description,
        category: s.category || "other",
        icon: defaults.icon,
        color: defaults.color,
      });
      setAdded((prev) => new Set(prev).add(i));
      await onHabitAdded?.(); // refresh the dashboard; the wizard stays open so you can add the others too
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't add that habit."));
    } finally {
      setAdding(null);
    }
  };

  const startOver = () => {
    setSuggestions(null);
    setStep(0);
    setError("");
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="glass max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-xl font-semibold">
            <Wand2 size={20} className="text-violet-500" /> Habit suggestion wizard
          </h2>
          <button onClick={onClose} aria-label="Close" className="opacity-60 hover:opacity-100">
            <X size={20} />
          </button>
        </div>

        {error && (
          <p role="alert" className="mb-3 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-500">
            {error}
          </p>
        )}

        {!suggestions && (
          <form onSubmit={next}>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide opacity-60">
              Step {step + 1} of {STEPS.length}
            </p>
            {step === 0 && (
              <div>
                <label htmlFor="wiz-goals" className="mb-1 block text-sm font-medium opacity-80">
                  What are you hoping to achieve?
                </label>
                <textarea
                  id="wiz-goals"
                  autoFocus
                  value={goals}
                  onChange={(e) => setGoals(e.target.value)}
                  placeholder="e.g. Feel more energetic, reduce stress, get in shape…"
                  rows={3}
                  className="field"
                />
              </div>
            )}
            {step === 1 && (
              <div>
                <label htmlFor="wiz-energy" className="mb-1 block text-sm font-medium opacity-80">
                  When are you most productive / energetic?
                </label>
                <input
                  id="wiz-energy"
                  autoFocus
                  value={peakEnergyTime}
                  onChange={(e) => setPeakEnergyTime(e.target.value)}
                  placeholder="e.g. Early morning, after lunch, evenings…"
                  className="field"
                />
              </div>
            )}
            {step === 2 && (
              <div>
                <label htmlFor="wiz-struggles" className="mb-1 block text-sm font-medium opacity-80">
                  What's tripped you up in the past?
                </label>
                <textarea
                  id="wiz-struggles"
                  autoFocus
                  value={pastStruggles}
                  onChange={(e) => setPastStruggles(e.target.value)}
                  placeholder="e.g. Losing motivation after a week, too busy, forgetting…"
                  rows={3}
                  className="field"
                />
              </div>
            )}

            <div className="mt-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {step > 0 && (
                  <button type="button" onClick={() => setStep(step - 1)} disabled={loading} aria-label="Back" className="opacity-70 hover:opacity-100">
                    <ArrowLeft size={18} />
                  </button>
                )}
                <div className="flex gap-1.5">
                  {STEPS.map((_, i) => (
                    <div key={i} className={`h-1.5 w-6 rounded-full ${i <= step ? "bg-violet-500" : "bg-[var(--track)]"}`} />
                  ))}
                </div>
              </div>
              <button
                type="submit"
                disabled={loading || (step === 0 && !goals.trim())}
                className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {loading ? "Generating…" : step === STEPS.length - 1 ? "Get suggestions" : "Next"}
                {!loading && <ArrowRight size={14} />}
              </button>
            </div>
          </form>
        )}

        {suggestions && (
          <div className="grid gap-3">
            {suggestions.length === 0 && <p className="text-sm opacity-70">No suggestions returned — try again.</p>}
            {suggestions.map((s, i) => {
              const isAdded = added.has(i);
              return (
                <div key={i} className="rounded-xl border border-[var(--field-border)] bg-[var(--field-bg)] p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold">{s.name}</p>
                      <p className="mt-0.5 text-sm opacity-75">{s.description}</p>
                      {s.suggestedTime && (
                        <p className="mt-1 flex items-center gap-1 text-xs opacity-70">
                          <Clock size={11} /> {s.suggestedTime}
                        </p>
                      )}
                      {s.whyItFits && <p className="mt-1 text-xs italic opacity-60">{s.whyItFits}</p>}
                    </div>
                    <button
                      onClick={() => addSuggestion(s, i)}
                      disabled={isAdded || adding !== null}
                      aria-label={isAdded ? `${s.name} added` : `Add ${s.name}`}
                      className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
                        isAdded ? "bg-emerald-500/20 text-emerald-500" : "bg-violet-500/20 text-violet-500 hover:bg-violet-500/30"
                      } disabled:cursor-default`}
                    >
                      {isAdded ? <Check size={16} /> : <Plus size={16} />}
                    </button>
                  </div>
                </div>
              );
            })}
            <div className="mt-1 flex justify-between">
              <button onClick={startOver} className="text-sm opacity-70 hover:opacity-100">
                Start over
              </button>
              <button onClick={onClose} className="rounded-xl bg-[var(--track)] px-4 py-1.5 text-sm font-medium">
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
