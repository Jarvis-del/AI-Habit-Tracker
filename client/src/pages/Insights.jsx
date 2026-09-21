import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { FileText, RefreshCw, AlertTriangle } from "lucide-react";
import { useHabits } from "../hooks/useHabits.js";
import { habitService } from "../services/habitService.js";
import { aiService } from "../services/aiService.js";
import { getHabitIcon } from "../utils/constants.js";
import { getErrorMessage } from "../utils/errors.js";
import HeatMap from "../components/HeatMap.jsx";
import StatsCharts from "../components/StatsCharts.jsx";
import AIChat from "../components/AIChat.jsx";

export default function Insights() {
  const { habits } = useHabits();
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState("");
  const [report, setReport] = useState({ status: "loading", text: "", error: "" });

  useEffect(() => {
    if (habits.length > 0 && (!selectedId || !habits.some((h) => h._id === selectedId))) setSelectedId(habits[0]._id);
  }, [habits, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setDetail(null);
    habitService
      .get(selectedId)
      .then((d) => !cancelled && (setDetail(d), setDetailError("")))
      .catch((err) => !cancelled && setDetailError(getErrorMessage(err, "Couldn't load this habit.")));
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const loadReport = useCallback(async (refresh = false) => {
    setReport((r) => ({ ...r, status: "loading" }));
    try {
      const res = await aiService.weeklyReport(refresh);
      if (res.empty || !res.report) setReport({ status: "empty", text: "", error: "" });
      else setReport({ status: "ready", text: res.report, error: "" });
    } catch (err) {
      setReport({ status: "error", text: "", error: getErrorMessage(err, "Couldn't generate your weekly report.") });
    }
  }, []);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const selected = habits.find((h) => h._id === selectedId);

  return (
    <div className="mx-auto max-w-4xl px-4 pb-24 pt-6 md:px-8">
      <h1 className="mb-5 font-display text-2xl font-bold">Insights</h1>

      <div className="glass mb-6 rounded-3xl p-6">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-display font-semibold">
            <FileText size={18} className="text-violet-500" /> Weekly AI report
          </div>
          <button
            onClick={() => loadReport(true)}
            disabled={report.status === "loading"}
            aria-label="Regenerate weekly report"
            title="Regenerate"
            className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/20 disabled:opacity-40"
          >
            <RefreshCw size={15} className={report.status === "loading" ? "animate-spin" : ""} />
          </button>
        </div>
        {report.status === "loading" && <p className="text-sm opacity-60">Analyzing your last 7 days…</p>}
        {report.status === "ready" && (
          <div className="md-content text-sm leading-relaxed opacity-90">
            <ReactMarkdown>{report.text}</ReactMarkdown>
          </div>
        )}
        {report.status === "empty" && <p className="text-sm opacity-60">Add a habit and track it for a few days to get your first report.</p>}
        {report.status === "error" && (
          <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />
            <span>{report.error}</span>
          </div>
        )}
      </div>

      <StatsCharts habits={habits} />

      <div className="glass mt-6 rounded-3xl p-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="mr-2 font-display font-semibold">90-day heat map:</span>
          {habits.map((h) => {
            const Icon = getHabitIcon(h.icon);
            const active = selectedId === h._id;
            return (
              <button
                key={h._id}
                onClick={() => setSelectedId(h._id)}
                aria-pressed={active}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${active ? "text-white" : "opacity-70 hover:opacity-100"}`}
                style={{ background: active ? h.color : "var(--track)" }}
              >
                <Icon size={12} /> {h.name}
              </button>
            );
          })}
        </div>

        {habits.length === 0 ? (
          <p className="text-sm opacity-60">No habits yet.</p>
        ) : detailError ? (
          <p role="alert" className="text-sm text-red-500">{detailError}</p>
        ) : detail ? (
          <>
            <HeatMap data={detail.heatMap} color={selected?.color} />
            <div className="mt-4 flex flex-wrap gap-6 text-sm opacity-80">
              <span>Current streak: <strong>{detail.streaks.currentStreak}</strong></span>
              <span>Longest streak: <strong>{detail.streaks.longestStreak}</strong></span>
              <span>Total completions: <strong>{detail.streaks.totalCompletions}</strong></span>
            </div>
          </>
        ) : (
          <p className="flex items-center gap-2 text-sm opacity-60">
            <RefreshCw size={14} className="animate-spin" /> Loading…
          </p>
        )}
      </div>

      <AIChat />
    </div>
  );
}
