import { describe, it, expect } from "vitest";
import { calculateStreaks, detectBrokenStreak, buildHeatMap, buildWeekStrip } from "../../src/utils/streaks.js";

const TODAY = "2026-09-20";
const run = (from, length) => Array.from({ length }, (_, i) => {
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + i);
  return d.toISOString().slice(0, 10);
});

describe("calculateStreaks", () => {
  it("returns zeros for no data", () => {
    expect(calculateStreaks([], TODAY)).toEqual({ currentStreak: 0, longestStreak: 0, totalCompletions: 0, lastCompletedDate: null, completedToday: false });
  });

  it("counts a streak that includes today", () => {
    const s = calculateStreaks(["2026-09-18", "2026-09-19", "2026-09-20"], TODAY);
    expect(s).toMatchObject({ currentStreak: 3, longestStreak: 3, completedToday: true });
  });

  it("keeps the streak alive when the last completion was yesterday", () => {
    const s = calculateStreaks(["2026-09-18", "2026-09-19"], TODAY);
    expect(s).toMatchObject({ currentStreak: 2, completedToday: false });
  });

  it("resets the current streak after a missed day but remembers the longest", () => {
    const s = calculateStreaks([...run("2026-09-01", 5), "2026-09-19"], TODAY);
    expect(s.currentStreak).toBe(1);
    expect(s.longestStreak).toBe(5);
  });

  it("ignores duplicates and input order", () => {
    const s = calculateStreaks(["2026-09-20", "2026-09-19", "2026-09-19", "2026-09-18"], TODAY);
    expect(s.totalCompletions).toBe(3);
    expect(s.currentStreak).toBe(3);
  });

  it("handles month and year boundaries", () => {
    const s = calculateStreaks(["2025-12-30", "2025-12-31", "2026-01-01"], "2026-01-01");
    expect(s.currentStreak).toBe(3);
  });

  it("handles leap days", () => {
    expect(calculateStreaks(["2028-02-28", "2028-02-29", "2028-03-01"], "2028-03-01").currentStreak).toBe(3);
  });
});

describe("detectBrokenStreak", () => {
  it("detects an 8-day streak whose last day was 4 days ago", () => {
    const dates = run("2026-09-09", 8); // 09-09 .. 09-16
    expect(detectBrokenStreak(dates, 7, TODAY)).toEqual({ brokenStreakLength: 8, lastCompletedDate: "2026-09-16", daysSinceLast: 4 });
  });

  it("returns null while the streak is still alive (done yesterday or today)", () => {
    expect(detectBrokenStreak(run("2026-09-10", 10), 7, TODAY)).toBeNull(); // ends 09-19
    expect(detectBrokenStreak(run("2026-09-11", 10), 7, TODAY)).toBeNull(); // ends 09-20
  });

  it("returns null for streaks shorter than the minimum", () => {
    expect(detectBrokenStreak(run("2026-09-10", 6), 7, TODAY)).toBeNull();
  });

  it("returns null when the break is old history (> 5 days ago)", () => {
    expect(detectBrokenStreak(run("2026-08-01", 10), 7, TODAY)).toBeNull();
  });

  it("returns null with no data", () => {
    expect(detectBrokenStreak([], 7, TODAY)).toBeNull();
  });
});

describe("heat map and week strip", () => {
  it("buildHeatMap returns N days ending today, oldest first, with counts", () => {
    const map = buildHeatMap(["2026-09-20", "2026-09-18"], 90, TODAY);
    expect(map).toHaveLength(90);
    expect(map.at(-1)).toEqual({ date: TODAY, count: 1 });
    expect(map.at(-3)).toEqual({ date: "2026-09-18", count: 1 });
    expect(map[0].date).toBe("2026-06-23");
  });

  it("buildWeekStrip marks the right days", () => {
    const strip = buildWeekStrip(["2026-09-20", "2026-09-14"], TODAY);
    expect(strip).toHaveLength(7);
    expect(strip[0]).toEqual({ date: "2026-09-14", done: true });
    expect(strip[6]).toEqual({ date: TODAY, done: true });
    expect(strip.filter((d) => d.done)).toHaveLength(2);
  });
});
