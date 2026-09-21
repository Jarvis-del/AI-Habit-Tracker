import { describe, it, expect } from "vitest";
import { shiftDate, isValidYmd, lastNDates, todayInTimeZone } from "../../src/utils/dates.js";

describe("dates", () => {
  it("shiftDate crosses month/year/leap boundaries", () => {
    expect(shiftDate("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDate("2028-03-01", -1)).toBe("2028-02-29");
    expect(shiftDate("2025-12-31", 1)).toBe("2026-01-01");
  });

  it("isValidYmd accepts real dates only", () => {
    expect(isValidYmd("2026-09-20")).toBe(true);
    for (const bad of ["2026-02-31", "2026-13-01", "20260920", "2026-9-2", "", null, undefined, 20260920, "2026-09-20T00:00"]) {
      expect(isValidYmd(bad)).toBe(false);
    }
  });

  it("lastNDates returns N consecutive days oldest first", () => {
    expect(lastNDates(3, "2026-03-01")).toEqual(["2026-02-27", "2026-02-28", "2026-03-01"]);
  });

  it("todayInTimeZone respects the zone (UTC+14 is ahead of UTC-11)", () => {
    expect(todayInTimeZone("Pacific/Kiritimati") > todayInTimeZone("Pacific/Pago_Pago")).toBe(true);
    expect(todayInTimeZone("Asia/Kolkata")).toBe(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date()));
  });

  it("todayInTimeZone falls back safely for invalid zones", () => {
    for (const bad of ["Not/AZone", "", undefined, null, 5, "<script>"]) {
      expect(todayInTimeZone(bad)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
