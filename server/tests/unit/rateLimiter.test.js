import { describe, it, expect, vi, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import { rateLimiter } from "../../src/middlewares/rateLimiter.js";

const fakeRes = () => {
  const res = new EventEmitter();
  res.headers = {};
  res.statusCode = 200;
  res.setHeader = (k, v) => (res.headers[k] = v);
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res.emit("finish"), res);
  return res;
};
const hit = (limiter, req = { method: "GET", ip: "1.1.1.1" }) => {
  const res = fakeRes();
  let passed = false;
  limiter(req, res, () => (passed = true));
  return { res, passed };
};

afterEach(() => vi.useRealTimers());

describe("rateLimiter", () => {
  it("allows up to max, then blocks with 429 + Retry-After", () => {
    const limiter = rateLimiter({ max: 3, windowMs: 60_000 });
    expect([1, 2, 3].map(() => hit(limiter).passed)).toEqual([true, true, true]);
    const blocked = hit(limiter);
    expect(blocked.passed).toBe(false);
    expect(blocked.res.statusCode).toBe(429);
    expect(Number(blocked.res.headers["Retry-After"])).toBeGreaterThan(0);
    expect(blocked.res.body.message).toMatch(/Try again in \d+s/);
  });

  it("tracks each key independently", () => {
    const limiter = rateLimiter({ max: 1 });
    expect(hit(limiter, { method: "GET", ip: "a" }).passed).toBe(true);
    expect(hit(limiter, { method: "GET", ip: "b" }).passed).toBe(true);
    expect(hit(limiter, { method: "GET", ip: "a" }).passed).toBe(false);
  });

  it("two limiters never share counters (regression: AI limiter starved by the global one)", () => {
    const global = rateLimiter({ max: 100 });
    const ai = rateLimiter({ max: 2 });
    for (let i = 0; i < 50; i++) hit(global);
    expect(hit(ai).passed).toBe(true);
    expect(hit(ai).passed).toBe(true);
    expect(hit(ai).passed).toBe(false);
  });

  it("resets after the window", () => {
    vi.useFakeTimers();
    const limiter = rateLimiter({ max: 1, windowMs: 1000 });
    expect(hit(limiter).passed).toBe(true);
    expect(hit(limiter).passed).toBe(false);
    vi.advanceTimersByTime(1100);
    expect(hit(limiter).passed).toBe(true);
  });

  it("skipSuccessfulRequests only counts failures", () => {
    const limiter = rateLimiter({ max: 2, skipSuccessfulRequests: true });
    const attempt = (status) => {
      const res = fakeRes();
      let passed = false;
      limiter({ method: "POST", ip: "z" }, res, () => (passed = true));
      if (passed) { res.statusCode = status; res.emit("finish"); }
      return passed;
    };
    for (let i = 0; i < 10; i++) expect(attempt(200)).toBe(true); // successes never count
    expect(attempt(401)).toBe(true);
    expect(attempt(401)).toBe(true);
    expect(attempt(401)).toBe(false); // third failure is blocked
  });

  it("ignores CORS preflight requests", () => {
    const limiter = rateLimiter({ max: 1 });
    for (let i = 0; i < 5; i++) expect(hit(limiter, { method: "OPTIONS", ip: "x" }).passed).toBe(true);
  });
});
