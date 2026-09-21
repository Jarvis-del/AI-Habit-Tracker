import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { bootstrap, makeApi, registerUser, daysAgo } from "../helpers/setup.js";
import { REFRESH_COOKIE } from "../../src/utils/generateToken.js";

let ctx, api, alice, bob;

beforeAll(async () => {
  // default (production-like) limits are exercised in the rate-limit tests below
  ctx = await bootstrap({ REGISTER_RATE_LIMIT_MAX: "1000", AUTH_RATE_LIMIT_MAX: "5" });
  api = makeApi(ctx.app);
  alice = await registerUser(ctx.app, { email: "alice@example.com" });
  bob = await registerUser(ctx.app, { email: "bob@example.com" });
});
afterAll(() => ctx.close());

describe("secure HTTP headers (helmet)", () => {
  it("sets the standard hardening headers and hides the framework", async () => {
    const res = await api.get("/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBeDefined();
    expect(res.headers["strict-transport-security"]).toBeDefined();
    expect(res.headers["content-security-policy"]).toBeDefined();
    expect(res.headers["referrer-policy"]).toBeDefined();
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});

describe("CORS", () => {
  it("allows the configured frontend origin with credentials", async () => {
    const res = await request(ctx.app).get("/api/v1/health").set("Origin", "http://localhost:5173");
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("does not grant any other origin access", async () => {
    const res = await request(ctx.app).get("/api/v1/health").set("Origin", "https://evil.example");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("answers preflight for the custom headers our client sends", async () => {
    const res = await request(ctx.app)
      .options("/api/v1/auth/refresh")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "x-requested-with,x-timezone,authorization,content-type");
    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-headers"]).toMatch(/x-requested-with/i);
  });
});

describe("refresh cookie attributes", () => {
  const login = () => request(ctx.app).post("/api/v1/auth/login").send({ email: alice.email, password: alice.password });
  const cookieOf = (res) => res.headers["set-cookie"].find((c) => c.startsWith(`${REFRESH_COOKIE}=`));

  it("is HttpOnly, SameSite=Lax and scoped to /api/v1/auth in development", async () => {
    const c = cookieOf(await login());
    expect(c).toMatch(/HttpOnly/i);
    expect(c).toMatch(/SameSite=Lax/i);
    expect(c).toMatch(/Path=\/api\/v1\/auth/);
    expect(c).not.toMatch(/Secure/i);
    expect(c).toMatch(/Max-Age=604800/); // 7 days
  });

  it("adds Secure in production", async () => {
    process.env.NODE_ENV = "production";
    const c = cookieOf(await login());
    process.env.NODE_ENV = "test";
    expect(c).toMatch(/Secure/i);
  });

  it("supports cross-site deployments (SameSite=None forces Secure)", async () => {
    process.env.COOKIE_SAMESITE = "none";
    const c = cookieOf(await login());
    delete process.env.COOKIE_SAMESITE;
    expect(c).toMatch(/SameSite=None/i);
    expect(c).toMatch(/Secure/i);
  });
});

describe("NoSQL injection", () => {
  it("cannot bypass login with operator objects", async () => {
    for (const body of [
      { email: { $gt: "" }, password: { $gt: "" } },
      { email: { $ne: null }, password: "password123" },
      { email: alice.email, password: { $ne: "x" } },
    ]) {
      const res = await api.post("/auth/login", { body });
      expect([400, 401]).toContain(res.status);
      expect(res.body.token).toBeUndefined();
    }
  });

  it("rejects operator objects in habit fields", async () => {
    const res = await api.post("/habits", { token: alice.token, body: { name: "x", category: { $ne: "health" } } });
    expect(res.status).toBe(400);
  });

  it("cannot read other users' data through query operators", async () => {
    const habit = (await api.post("/habits", { token: alice.token, body: { name: "Secret", category: "health" } })).body.habit;
    await api.post("/logs/toggle", { token: alice.token, body: { habitId: habit._id } });

    // bob tries to list logs with {$ne: ""} style filters
    const res = await request(ctx.app)
      .get("/api/v1/logs?habitId[$ne]=000000000000000000000000&from[$gt]=")
      .set("Authorization", `Bearer ${bob.token}`);
    expect([200, 400]).toContain(res.status);
    expect(JSON.stringify(res.body)).not.toContain(habit._id);
  });

  it("users cannot see or modify each other's habits (IDOR)", async () => {
    const habit = (await api.post("/habits", { token: alice.token, body: { name: "Private", category: "health" } })).body.habit;
    expect((await api.get(`/habits/${habit._id}`, { token: bob.token })).status).toBe(404);
    expect((await api.patch(`/habits/${habit._id}`, { token: bob.token, body: { name: "pwned" } })).status).toBe(404);
    expect((await api.del(`/habits/${habit._id}`, { token: bob.token })).status).toBe(404);
    expect((await api.post("/logs/toggle", { token: bob.token, body: { habitId: habit._id } })).status).toBe(404);
    const list = await api.get("/habits", { token: bob.token });
    expect(list.body.habits.find((h) => h._id === habit._id)).toBeUndefined();
    // and the owner's habit is untouched
    expect((await api.get(`/habits/${habit._id}`, { token: alice.token })).body.habit.name).toBe("Private");
  });

  it("does not allow changing a habit's owner via mass assignment", async () => {
    const habit = (await api.post("/habits", { token: alice.token, body: { name: "Mine", category: "health", user: bob.user.id } })).body.habit;
    expect(habit.user).toBe(alice.user.id);
    const patched = await api.patch(`/habits/${habit._id}`, { token: alice.token, body: { user: bob.user.id, name: "Renamed" } });
    expect(patched.body.habit.user).toBe(alice.user.id);
    expect(patched.body.habit.name).toBe("Renamed");
  });
});

describe("request limits and error hygiene", () => {
  it("rejects oversized bodies (>100kb) with 413", async () => {
    const res = await api.post("/habits", { token: alice.token, body: { name: "x".repeat(200_000) } });
    expect(res.status).toBe(413);
  });

  it("rejects malformed JSON with 400 (no stack trace)", async () => {
    const res = await request(ctx.app).post("/api/v1/habits").set("Authorization", `Bearer ${alice.token}`).set("Content-Type", "application/json").send("{bad json");
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\.js/);
  });

  it("returns 400 for invalid ObjectIds and impossible dates instead of 500", async () => {
    expect((await api.get("/habits/not-an-id", { token: alice.token })).status).toBe(400);
    const habit = (await api.post("/habits", { token: alice.token, body: { name: "D", category: "health" } })).body.habit;
    expect((await api.post("/logs/toggle", { token: alice.token, body: { habitId: habit._id, date: "2026-02-31" } })).status).toBe(400);
    expect((await api.post("/logs/toggle", { token: alice.token, body: { habitId: habit._id, date: "2999-01-01" } })).status).toBe(400);
  });

  it("returns JSON 404 for unknown routes", async () => {
    const res = await api.get("/nope");
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it("never allows logging a habit in the future", async () => {
    const habit = (await api.post("/habits", { token: alice.token, body: { name: "F", category: "health" } })).body.habit;
    const ok = await api.post("/logs/toggle", { token: alice.token, body: { habitId: habit._id, date: daysAgo(1) } });
    expect(ok.status).toBe(201);
  });
});

describe("brute-force protection", () => {
  const attempt = (email, password) => api.post("/auth/login", { body: { email, password } });

  it("locks an account after repeated FAILED logins (limit 5 here) with Retry-After", async () => {
    const victim = await registerUser(ctx.app, { email: "victim@example.com" });
    for (let i = 0; i < 5; i++) expect((await attempt(victim.email, "wrong-pass1")).status).toBe(401);
    const blocked = await attempt(victim.email, "wrong-pass1");
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
    expect(blocked.body.message).toMatch(/failed login attempts/i);
    // even the right password is refused while locked (otherwise an attacker could keep guessing)
    expect((await attempt(victim.email, victim.password)).status).toBe(429);
  });

  it("does not lock other accounts", async () => {
    expect((await attempt(bob.email, bob.password)).status).toBe(200);
  });

  it("successful logins never count toward the limit", async () => {
    for (let i = 0; i < 12; i++) expect((await attempt(alice.email, alice.password)).status).toBe(200);
  });
});
