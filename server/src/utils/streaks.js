import { differenceInCalendarDays, parseISO, format } from "date-fns";
import { shiftDate, lastNDates } from "./dates.js";

const todayLocal = () => format(new Date(), "yyyy-MM-dd");

/**
 * Given an array of completedDate strings ("YYYY-MM-DD"), calculate current streak,
 * longest streak and total completions. `today` ("YYYY-MM-DD") is the user's local date.
 */
export function calculateStreaks(completedDates, today = todayLocal()) {
  if (!completedDates || completedDates.length === 0) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      totalCompletions: 0,
      lastCompletedDate: null,
      completedToday: false,
    };
  }

  // Ensure unique, sorted descending (most recent first)
  const uniqueDates = [...new Set(completedDates)].sort((a, b) => (a < b ? 1 : -1));
  const yesterday = shiftDate(today, -1);

  // --- Current streak ---
  let currentStreak = 0;
  const mostRecent = uniqueDates[0];
  // Streak is only "current" if the most recent completion was today or yesterday
  if (mostRecent === today || mostRecent === yesterday) {
    currentStreak = 1;
    for (let i = 0; i < uniqueDates.length - 1; i++) {
      const diff = differenceInCalendarDays(parseISO(uniqueDates[i]), parseISO(uniqueDates[i + 1]));
      if (diff === 1) currentStreak++;
      else break;
    }
  }

  // --- Longest streak ---
  let longestStreak = 1;
  let running = 1;
  const ascending = [...uniqueDates].sort();
  for (let i = 1; i < ascending.length; i++) {
    const diff = differenceInCalendarDays(parseISO(ascending[i]), parseISO(ascending[i - 1]));
    if (diff === 1) {
      running++;
      longestStreak = Math.max(longestStreak, running);
    } else {
      running = 1;
    }
  }

  return {
    currentStreak,
    longestStreak,
    totalCompletions: uniqueDates.length,
    lastCompletedDate: mostRecent,
    completedToday: uniqueDates.includes(today),
  };
}

/**
 * Detects if a streak of `minLength`+ days was just broken (i.e. no completion
 * yesterday or today, but there WAS a streak ending within the last few days).
 */
export function detectBrokenStreak(completedDates, minLength = 7, today = todayLocal()) {
  if (!completedDates || completedDates.length === 0) return null;
  const uniqueDates = [...new Set(completedDates)].sort((a, b) => (a < b ? 1 : -1));
  const yesterday = shiftDate(today, -1);
  const mostRecent = uniqueDates[0];

  // If they completed today or yesterday, streak isn't broken
  if (mostRecent === today || mostRecent === yesterday) return null;

  // Only flag if the gap since the last completion is small (recently broken, not ancient history)
  const daysSinceLast = differenceInCalendarDays(parseISO(today), parseISO(mostRecent));
  if (daysSinceLast > 5 || daysSinceLast < 0) return null;

  // Walk backward from mostRecent to see how long that streak was
  let streakLength = 1;
  for (let i = 0; i < uniqueDates.length - 1; i++) {
    const diff = differenceInCalendarDays(parseISO(uniqueDates[i]), parseISO(uniqueDates[i + 1]));
    if (diff === 1) streakLength++;
    else break;
  }

  if (streakLength >= minLength) {
    return { brokenStreakLength: streakLength, lastCompletedDate: mostRecent, daysSinceLast };
  }
  return null;
}

/** Builds a 90-day heat map dataset: [{ date: 'YYYY-MM-DD', count: n }] (oldest first). */
export function buildHeatMap(completedDates, days = 90, today = todayLocal()) {
  const counts = {};
  for (const d of completedDates) counts[d] = (counts[d] || 0) + 1;
  return lastNDates(days, today).map((date) => ({ date, count: counts[date] || 0 }));
}

/** Last 7 days as [{ date, done }] (oldest first) - powers the weekly consistency grid. */
export function buildWeekStrip(completedDates, today = todayLocal(), days = 7) {
  const set = new Set(completedDates);
  return lastNDates(days, today).map((date) => ({ date, done: set.has(date) }));
}
