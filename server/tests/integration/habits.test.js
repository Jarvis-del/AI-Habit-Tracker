import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { bootstrap, makeApi, registerUser, daysAgo } from "../helpers/setup.js";

let ctx, api, u;
const create = (body) => api.post("/habits", { token: u.token, body });

beforeAll(async () => {
  ctx = await bootstrap();
  api = makeApi(ctx.app);
  u = await registerUser(ctx.app);
});
afterAll(() => ctx.close());

describe("habit CRUD", () => {
  it("requires authentication", async () => {
    expect((await api.get("/habits")).status).toBe(401);
    expect((await api.post("/habits", { body: { name: "x" } })).status).toBe(401);
  });

  it("creates a habit with defaults", async () => {
    const res = await create({ name: "  Run  ", category: "fitness", icon: "Footprints", color: "#f97316" });
    expect(res.status).toBe(201);
    expect(res.body.habit).toMatchObject({ name: "Run", category: "fitness", icon: "Footprints", isArchived: false });
  });

  it("validates input (400 instead of 500)", async () => {
    expect((await create({ name: "" })).status).toBe(400);
    expect((await create({ name: "x", category: "Health" })).status).toBe(400); // not in the enum
    expect((await api.get("/habits/not-an-id", { token: u.token })).status).toBe(400);
  });

  it("updates, archives (hidden from the list), un-archives and deletes with its logs", async () => {
    const h = (await create({ name: "Temp", category: "other" })).body.habit;
    expect((await api.patch(`/habits/${h._id}`, { token: u.token, body: { name: "Renamed" } })).body.habit.name).toBe("Renamed");

    await api.post("/logs/toggle", { token: u.token, body: { habitId: h._id } });
    await api.patch(`/habits/${h._id}/archive`, { token: u.token });
    expect((await api.get("/habits", { token: u.token })).body.habits.find((x) => x._id === h._id)).toBeUndefined();
    expect((await api.get("/habits?includeArchived=true", { token: u.token })).body.habits.find((x) => x._id === h._id)).toBeDefined();
    await api.patch(`/habits/${h._id}/archive`, { token: u.token });
    expect((await api.get("/habits", { token: u.token })).body.habits.find((x) => x._id === h._id)).toBeDefined();

    expect((await api.del(`/habits/${h._id}`, { token: u.token })).status).toBe(200);
    expect((await api.get(`/habits/${h._id}`, { token: u.token })).status).toBe(404);
    expect((await api.get(`/logs?habitId=${h._id}`, { token: u.token })).body.logs).toHaveLength(0);
  });
});

describe("completions and streaks", () => {
  let habit;
  beforeAll(async () => (habit = (await create({ name: "Read", category: "learning" })).body.habit));

  it("toggles on and off", async () => {
    const on = await api.post("/logs/toggle", { token: u.token, body: { habitId: habit._id } });
    expect(on.status).toBe(201);
    expect(on.body.completed).toBe(true);
    const off = await api.post("/logs/toggle", { token: u.token, body: { habitId: habit._id } });
    expect(off.status).toBe(200);
    expect(off.body.completed).toBe(false);
  });

  it("handles a double-click race without duplicates or 500s", async () => {
    const results = await Promise.all([1, 2, 3, 4].map(() => api.post("/logs/toggle", { token: u.token, body: { habitId: habit._id } })));
    expect(results.every((r) => r.status === 200 || r.status === 201)).toBe(true);
    const logs = (await api.get(`/logs?habitId=${habit._id}`, { token: u.token })).body.logs;
    expect(new Set(logs.map((l) => l.completedDate)).size).toBe(logs.length); // never two logs for one date
  });

  it("computes current + longest streak and completedToday in the list", async () => {
    const h = (await create({ name: "Streaky", category: "health" })).body.habit;
    for (const n of [0, 1, 2, 3]) await api.post("/logs/toggle", { token: u.token, body: { habitId: h._id, date: daysAgo(n) } });
    await api.post("/logs/toggle", { token: u.token, body: { habitId: h._id, date: daysAgo(10) } });
    const found = (await api.get("/habits", { token: u.token })).body.habits.find((x) => x._id === h._id);
    expect(found.streaks).toMatchObject({ currentStreak: 4, longestStreak: 4, totalCompletions: 5, completedToday: true });
    expect(found.streaks.week).toHaveLength(7);
    expect(found.streaks.weekCompletions).toBe(4);
  });

  it("rejects future and impossible dates", async () => {
    expect((await api.post("/logs/toggle", { token: u.token, body: { habitId: habit._id, date: "2999-01-01" } })).status).toBe(400);
    expect((await api.post("/logs/toggle", { token: u.token, body: { habitId: habit._id, date: "2026-02-31" } })).status).toBe(400);
    expect((await api.post("/logs/toggle", { token: u.token, body: { habitId: habit._id, date: "yesterday" } })).status).toBe(400);
  });

  it("habit detail returns a 90-day heat map", async () => {
    const res = await api.get(`/habits/${habit._id}`, { token: u.token });
    expect(res.body.heatMap).toHaveLength(90);
  });

  it("weekly summary gives this week, last week and daily flags", async () => {
    const h = (await create({ name: "Weekly", category: "health" })).body.habit;
    for (const n of [0, 2]) await api.post("/logs/toggle", { token: u.token, body: { habitId: h._id, date: daysAgo(n) } });
    for (const n of [8, 9, 10]) await api.post("/logs/toggle", { token: u.token, body: { habitId: h._id, date: daysAgo(n) } });
    const res = await api.get("/logs/weekly-summary", { token: u.token });
    const row = res.body.summary.find((s) => s.habitId === h._id);
    expect(res.body.dates).toHaveLength(7);
    expect(row).toMatchObject({ completions: 2, previousCompletions: 3, target: 7 });
    expect(row.daily).toHaveLength(7);
    expect(row.daily[6]).toBe(true);
  });
});

describe("time zones", () => {
  it("uses the X-Timezone header to decide what 'today' is", async () => {
    const ahead = await api.get("/habits", { token: u.token, headers: { "X-Timezone": "Pacific/Kiritimati" } });
    const behind = await api.get("/habits", { token: u.token, headers: { "X-Timezone": "Pacific/Pago_Pago" } });
    expect(ahead.body.today > behind.body.today).toBe(true);
  });

  it("a habit logged 'today' in the user's zone is completedToday in that zone", async () => {
    const h = (await create({ name: "TZ", category: "health" })).body.habit;
    const headers = { "X-Timezone": "Asia/Kolkata" };
    await api.post("/logs/toggle", { token: u.token, body: { habitId: h._id }, headers });
    const found = (await api.get("/habits", { token: u.token, headers })).body.habits.find((x) => x._id === h._id);
    expect(found.streaks.completedToday).toBe(true);
  });

  it("ignores invalid zones", async () => {
    expect((await api.get("/habits", { token: u.token, headers: { "X-Timezone": "Not/AZone" } })).status).toBe(200);
  });
});
