import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid } from "recharts";
import { Medal } from "lucide-react";
import { logService } from "../services/logService.js";
import { CATEGORY_COLORS } from "../utils/constants.js";
import { getErrorMessage } from "../utils/errors.js";
import WeeklyGrid from "./WeeklyGrid.jsx";

const tooltipStyle = { background: "#1e1b4b", border: "none", borderRadius: 8, color: "#fff" };
const tick = { fill: "currentColor", fontSize: 12 };
const GRID = "rgba(128,128,128,0.25)"; // SVG attributes can't use CSS variables
const short = (v) => (v.length > 11 ? `${v.slice(0, 10)}…` : v);

export default function StatsCharts({ habits }) {
  const [data, setData] = useState({ summary: [], dates: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    logService
      .weeklySummary()
      .then((res) => !cancelled && (setData({ summary: res.summary, dates: res.dates }), setError("")))
      .catch((err) => !cancelled && setError(getErrorMessage(err, "Couldn't load your stats.")))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [habits]);

  if (loading) return <div className="glass rounded-3xl p-8 text-center opacity-70">Loading charts…</div>;
  if (error) return <div role="alert" className="glass rounded-3xl p-6 text-sm text-red-500">{error}</div>;

  const { summary, dates } = data;
  const comparison = summary.map((s) => ({ name: s.name, "This week": s.completions, "Last week": s.previousCompletions }));
  const ranking = [...summary].sort((a, b) => b.completionRate - a.completionRate);

  const categoryTotals = {};
  summary.forEach((s) => (categoryTotals[s.category || "other"] = (categoryTotals[s.category || "other"] || 0) + s.completions));
  const categoryData = Object.entries(categoryTotals).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }));

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="glass rounded-3xl p-6 md:col-span-2">
        <h3 className="mb-4 font-display font-semibold">Weekly consistency</h3>
        <WeeklyGrid summary={summary} dates={dates} />
      </div>

      <div className="glass rounded-3xl p-6 md:col-span-2">
        <h3 className="mb-4 font-display font-semibold">This week vs last week</h3>
        {comparison.length === 0 ? (
          <p className="text-sm opacity-60">No habits yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={comparison} margin={{ left: -15, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
              <XAxis dataKey="name" tick={tick} tickFormatter={short} interval={0} />
              <YAxis tick={tick} allowDecimals={false} domain={[0, 7]} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(128,128,128,0.12)" }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Last week" fill="#a5b4fc" radius={[4, 4, 0, 0]} />
              <Bar dataKey="This week" fill="#7c3aed" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="glass rounded-3xl p-6">
        <h3 className="mb-4 font-display font-semibold">Completions by category</h3>
        {categoryData.length === 0 ? (
          <p className="text-sm opacity-60">No completions this week yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={categoryData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3}>
                {categoryData.map((entry) => (
                  <Cell key={entry.name} fill={CATEGORY_COLORS[entry.name] || "#94a3b8"} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12, textTransform: "capitalize" }} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="glass rounded-3xl p-6">
        <h3 className="mb-4 font-display font-semibold">Habit ranking (this week)</h3>
        {ranking.length === 0 ? (
          <p className="text-sm opacity-60">No habits yet.</p>
        ) : (
          <ol className="space-y-3">
            {ranking.map((s, i) => (
              <li key={s.habitId}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    {i < 3 ? <Medal size={14} className={["text-amber-400", "text-slate-400", "text-orange-500"][i]} /> : <span className="w-3.5 text-center text-xs opacity-50">{i + 1}</span>}
                    <span className="truncate font-medium">{s.name}</span>
                  </span>
                  <span className="tabular-nums opacity-70">{Math.round(s.completionRate * 100)}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--track)" }}>
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.round(s.completionRate * 100)}%`, background: s.color }} />
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
