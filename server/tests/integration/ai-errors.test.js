import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { bootstrap, makeApi, registerUser } from "../helpers/setup.js";
import { resetGeminiState } from "../../src/config/gemini.js";

let ctx, api, u;

beforeAll(async () => {
  ctx = await bootstrap();
  api = makeApi(ctx.app);
  u = await registerUser(ctx.app);
});
afterAll(() => ctx.close());
beforeEach(() => {
  ctx.mock.reset();
  resetGeminiState(); // each test starts with every model considered healthy
});

const chat = (message = "hello") => api.post("/ai/chat", { token: u.token, body: { message } });

describe("Gemini failures become clear messages with SAFE status codes", () => {
  // Never 401: the frontend treats 401 as "session expired" and would log the user out.
  it.each([
    ["quota", 429, /rate\/quota/i],
    ["badkey", 503, /invalid/i],
    ["forbidden", 503, /refused/i],
    ["server_error", 502, /temporarily unavailable/i],
    ["empty", 502, /empty answer/i],
  ])("%s -> HTTP %i", async (mode, status, message) => {
    ctx.mock.setMode(mode);
    const res = await chat(mode);
    expect(res.status).toBe(status);
    expect(res.status).not.toBe(401);
    expect(res.body.message).toMatch(message);
  });

  it("the user's login session survives a Gemini auth failure", async () => {
    ctx.mock.setMode("forbidden");
    await chat();
    expect((await api.get("/auth/me", { token: u.token })).status).toBe(200);
  });

  it("a retired model is skipped for a while, but forgiven after the TTL (Google sometimes reports it prematurely)", async () => {
    process.env.GEMINI_DEAD_MODEL_TTL_MS = "50";
    ctx.mock.setMode("model_gone");
    await chat("first");
    ctx.mock.requests.length = 0;
    await chat("within TTL");
    expect(ctx.mock.requests.map((r) => r.model)).toEqual(["gemini-3.6-flash"]);
    await new Promise((r) => setTimeout(r, 80));
    ctx.mock.requests.length = 0;
    await chat("after TTL");
    delete process.env.GEMINI_DEAD_MODEL_TTL_MS;
    expect(ctx.mock.requests.map((r) => r.model)).toEqual(["gemini-2.5-flash", "gemini-3.6-flash"]); // primary tried (and refused) again
  });

  it("falls back to the next model when the primary was retired, and stays on it", async () => {
    ctx.mock.setMode("model_gone");
    const first = await chat("fallback");
    expect(first.status).toBe(200);
    expect(ctx.mock.requests.map((r) => r.model)).toEqual(["gemini-2.5-flash", "gemini-3.6-flash"]);
    ctx.mock.requests.length = 0;
    await chat("again");
    expect(ctx.mock.requests.map((r) => r.model)).toEqual(["gemini-3.6-flash"]); // dead model not retried
  });

  it("explains a missing API key instead of crashing", async () => {
    const saved = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = "your_google_gemini_api_key_here";
    const res = await chat();
    process.env.GEMINI_API_KEY = saved;
    expect(res.status).toBe(503);
    expect(res.body.message).toMatch(/GEMINI_API_KEY/);
    expect(ctx.mock.requests).toHaveLength(0);
  });

  it("health endpoint reports whether AI is configured (never the key itself)", async () => {
    const res = await api.get("/health");
    expect(res.body.ai.configured).toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(/AIzaTestKey/);
  });
});

describe("resilience to an overloaded Gemini (HTTP 503 'The model is overloaded')", () => {
  const models = () => ctx.mock.requests.map((r) => r.model);

  it("retries a one-off 503 on the same model and succeeds (the user never sees an error)", async () => {
    ctx.mock.failNext(1);
    const res = await chat("blip");
    expect(res.status).toBe(200);
    expect(models()).toEqual(["gemini-2.5-flash", "gemini-2.5-flash"]);
  });

  it("survives two 503s in a row (default: up to 3 attempts per model)", async () => {
    ctx.mock.failNext(2);
    expect((await chat("double blip")).status).toBe(200);
    expect(models()).toHaveLength(3);
  });

  it("when the primary model stays overloaded it falls back to the next model", async () => {
    ctx.mock.failModel("gemini-2.5-flash", 503);
    const res = await chat("primary is saturated");
    expect(res.status).toBe(200);
    expect(models()).toEqual(["gemini-2.5-flash", "gemini-2.5-flash", "gemini-2.5-flash", "gemini-3.6-flash"]);
  });

  it("does not permanently blacklist a model that was only overloaded", async () => {
    await chat("recovered"); // mock was reset: primary is healthy again
    expect(models()).toEqual(["gemini-2.5-flash"]);
  });

  it("uses the next model when the primary hits its (per-model) rate limit", async () => {
    ctx.mock.failModel("gemini-2.5-flash", 429);
    const res = await chat("quota on primary only");
    expect(res.status).toBe(200);
    expect(models()).toEqual(["gemini-2.5-flash", "gemini-3.6-flash"]); // 429 is not retried on the same model
  });

  it("when EVERY model is overloaded: clear message with Google's reason and the models tried, after bounded attempts", async () => {
    for (const m of ["gemini-2.5-flash", "gemini-3.6-flash", "gemini-2.5-flash-lite"]) ctx.mock.failModel(m, 503);
    const res = await chat("everything down");
    expect(res.status).toBe(502);
    expect(res.body.message).toMatch(/temporarily unavailable/i);
    expect(res.body.message).toMatch(/503/);
    expect(res.body.message).toMatch(/model is overloaded/i); // the real reason is no longer hidden
    expect(res.body.message).toMatch(/models tried: gemini-2\.5-flash, gemini-3\.6-flash, gemini-2\.5-flash-lite/);
    expect(models()).toHaveLength(9); // 3 models x 3 attempts - bounded, never an endless loop
  });

  it("does NOT retry errors that retrying cannot fix (bad key / permission)", async () => {
    ctx.mock.setMode("badkey");
    expect((await chat("x")).status).toBe(503);
    expect(models()).toHaveLength(1);
    ctx.mock.reset();
    ctx.mock.setMode("forbidden");
    await chat("y");
    expect(models()).toHaveLength(1);
  });

  it("a model that HANGS is abandoned after the timeout and the next model answers (no endless spinner)", async () => {
    process.env.GEMINI_TIMEOUT_MS = "300";
    ctx.mock.hangModel("gemini-2.5-flash");
    const started = Date.now();
    const res = await chat("hang");
    delete process.env.GEMINI_TIMEOUT_MS;
    expect(res.status).toBe(200);
    expect(models()).toEqual(["gemini-2.5-flash", "gemini-3.6-flash"]); // not retried on the hanging model
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it("respects the overall time budget", async () => {
    process.env.GEMINI_TOTAL_BUDGET_MS = "1";
    ctx.mock.failNext(50);
    const res = await chat("budget");
    delete process.env.GEMINI_TOTAL_BUDGET_MS;
    expect([502, 504]).toContain(res.status);
    expect(models().length).toBeLessThanOrEqual(2);
  });

  it("an empty answer is retried once more before giving up", async () => {
    ctx.mock.setMode("empty");
    const res = await chat("empty");
    expect(res.status).toBe(502);
    expect(res.body.message).toMatch(/empty answer/i);
    expect(models().length).toBeGreaterThan(1);
  });
});
