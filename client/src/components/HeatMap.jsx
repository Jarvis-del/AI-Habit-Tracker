import { useMemo } from "react";
import { format, getDay, parseISO } from "date-fns";
import { formatShortDate } from "../utils/formatters.js";

const ROW_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""]; // rows are Sun..Sat

// GitHub-style 90-day heat map. Rows = weekdays (Sun..Sat), columns = weeks, so it lines up
// with real weekdays. Completed days use the habit's own colour.
export default function HeatMap({ data = [], color = "#7c3aed" }) {
  const { weeks, monthLabels } = useMemo(() => {
    if (!data.length) return { weeks: [], monthLabels: [] };
    const cells = [...Array(getDay(parseISO(data[0].date))).fill(null), ...data];
    const cols = [];
    for (let i = 0; i < cells.length; i += 7) cols.push(cells.slice(i, i + 7));
    let last = "";
    const labels = cols.map((col) => {
      const first = col.find(Boolean);
      const m = first ? format(parseISO(first.date), "MMM") : "";
      const show = m && m !== last;
      if (show) last = m;
      return show ? m : "";
    });
    return { weeks: cols, monthLabels: labels };
  }, [data]);

  const today = data.at(-1)?.date;
  const max = Math.max(1, ...data.map((d) => d.count));

  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex gap-1">
        <div className="flex flex-col gap-1 pr-1 pt-[18px] text-[10px] opacity-60">
          {ROW_LABELS.map((l, i) => (
            <div key={i} className="h-3.5 leading-[14px]">
              {l}
            </div>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            <div className="h-[14px] text-[10px] leading-[14px] opacity-60">{monthLabels[wi]}</div>
            {Array.from({ length: 7 }, (_, r) => {
              const day = week[r];
              if (!day) return <div key={r} className="h-3.5 w-3.5" />;
              return (
                <div
                  key={day.date}
                  title={`${formatShortDate(day.date)}: ${day.count} completion${day.count === 1 ? "" : "s"}`}
                  className="h-3.5 w-3.5 rounded-[3px] transition-transform hover:scale-125"
                  style={{
                    background: day.count ? color : "var(--track)",
                    opacity: day.count ? 0.45 + 0.55 * (day.count / max) : 1,
                    outline: day.date === today ? "1.5px solid currentColor" : "none",
                    outlineOffset: 1,
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-xs opacity-60">
        <span>Missed</span>
        <div className="h-3 w-3 rounded-[3px]" style={{ background: "var(--track)" }} />
        <div className="h-3 w-3 rounded-[3px]" style={{ background: color }} />
        <span>Done</span>
      </div>
    </div>
  );
}
