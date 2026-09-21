import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { bootstrap, makeApi, registerUser } from "../helpers/setup.js";

let ctx, api;

beforeAll(async () => {
  ctx = await bootstrap({ REGISTER_RATE_LIMIT_MAX: "3", AUTH_RATE_LIMIT_MAX: "1000" });
  api = makeApi(ctx.app);
});
afterAll(() => ctx.close());

describe("sign-up limiter", () => {
  it("allows 3 sign-ups per IP per hour, then answers 429", async () => {
    for (let i = 0; i < 3; i++) await registerUser(ctx.app);
    const res = await api.post("/auth/register", { body: { name: "Spam", email: "spam@example.com", password: "password123" } });
    expect(res.status).toBe(429);
    expect(res.body.message).toMatch(/sign-ups/i);
  });
});

describe("AI limiter is independent from the global limiter (regression)", () => {
  it("normal requests never eat the AI allowance, and each user has their own AI budget", async () => {
    // fresh app is rate-limited on register, so reuse existing accounts via login
    const { default: User } = await import("../../src/models/User.js");
    const users = await User.find().limit(2);
    const tokens = [];
    for (const u of users) {
      const login = await api.post("/auth/login", { body: { email: u.email, password: "password123" } });
      tokens.push(login.body.token);
    }
    const [a, b] = tokens;
    for (let i = 0; i < 60; i++) await api.get("/habits", { token: a }); // 60 normal calls
    expect((await api.get("/ai/morning-banner", { token: a })).status).toBe(200);

    let limitedAt = null;
    for (let i = 1; i <= 40; i++) {
      const r = await api.post("/ai/chat", { token: a, body: { message: `q${i}` } });
      if (r.status === 429) { limitedAt = i; expect(r.body.message).toMatch(/AI features/i); break; }
    }
    expect(limitedAt).toBeGreaterThanOrEqual(25);
    expect(limitedAt).toBeLessThanOrEqual(31);

    // user A is limited on AI, but B (and A's non-AI routes) are not
    expect((await api.post("/ai/chat", { token: b, body: { message: "hi" } })).status).toBe(200);
    expect((await api.get("/habits", { token: a })).status).toBe(200);
  });
});

describe("global limiter", () => {
  it("returns rate-limit headers", async () => {
    const res = await api.get("/health");
    expect(res.headers["x-ratelimit-limit"]).toBe("300");
    expect(Number(res.headers["x-ratelimit-remaining"])).toBeLessThan(300);
  });
});
