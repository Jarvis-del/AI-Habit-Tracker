import { format, parseISO } from "date-fns";
import { Check } from "lucide-react";

// Weekly consistency grid: habits (rows) x last 7 days (columns).
export default function WeeklyGrid({ summary = [], dates = [] }) {
  if (summary.length === 0) return <p className="text-sm opacity-60">No habits yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] border-separate border-spacing-y-1.5 text-sm">
        <thead>
          <tr className="text-xs opacity-60">
            <th className="text-left font-medium">Habit</th>
            {dates.map((d) => (
              <th key={d} className="w-9 text-center font-medium">
                <div>{format(parseISO(d), "EEE")}</div>
                <div className="text-[10px] opacity-70">{format(parseISO(d), "d")}</div>
              </th>
            ))}
            <th className="w-12 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {summary.map((s) => (
            <tr key={s.habitId}>
              <td className="max-w-[10rem] truncate pr-2 font-medium">{s.name}</td>
              {s.daily.map((done, i) => (
                <td key={i} className="text-center">
                  <span
                    className="mx-auto grid h-6 w-6 place-items-center rounded-md"
                    style={{ background: done ? s.color : "var(--track)", color: "#fff" }}
                    title={`${s.name} — ${format(parseISO(dates[i]), "EEE, MMM d")}: ${done ? "done" : "missed"}`}
                  >
                    {done && <Check size={13} strokeWidth={3} />}
                  </span>
                </td>
              ))}
              <td className="text-right tabular-nums opacity-80">
                {s.completions}/{s.target}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
