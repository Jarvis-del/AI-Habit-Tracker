import { addDays, format, parseISO } from "date-fns";

const YMD = "yyyy-MM-dd";
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

const isValidTimeZone = (tz) => {
  if (!tz || typeof tz !== "string") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

/** "YYYY-MM-DD" for right now in the given IANA time zone (falls back to the server's zone). */
export function todayInTimeZone(tz) {
  if (isValidTimeZone(tz)) {
    // en-CA formats dates as YYYY-MM-DD
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  }
  return format(new Date(), YMD);
}

/**
 * "Today" from the *user's* point of view. The client sends its IANA time zone in the
 * X-Timezone header, so the server, the browser and the database all agree on which
 * calendar day it is (previously the server used its own zone and the browser used UTC).
 */
export function getRequestToday(req) {
  return todayInTimeZone(req.headers?.["x-timezone"]);
}

/** Add (or subtract) whole days from a "YYYY-MM-DD" string. */
export function shiftDate(dateStr, days) {
  return format(addDays(parseISO(dateStr), days), YMD);
}

/** True for a real calendar date written as YYYY-MM-DD. */
export function isValidYmd(str) {
  if (typeof str !== "string" || !YMD_RE.test(str)) return false;
  const d = parseISO(str);
  return !Number.isNaN(d.getTime()) && format(d, YMD) === str;
}

/** The last `n` dates ending at `today`, oldest first. */
export function lastNDates(n, today) {
  return Array.from({ length: n }, (_, i) => shiftDate(today, -(n - 1 - i)));
}
