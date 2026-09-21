import { describe, it, expect, beforeEach, vi } from "vitest";
import api, { refreshClient, setAccessToken, getAccessToken } from "./api.js";

// Replace the network with scripted responses so we can test the interceptors in isolation
let script;
const reply = (status, data = {}) => ({ status, data, headers: {}, statusText: "" });
const fail = (config, status, data = {}) => {
  const err = new Error(`HTTP ${status}`);
  err.config = config;
  err.response = reply(status, data);
  return Promise.reject(err);
};

beforeEach(() => {
  setAccessToken(null);
  script = { calls: [], refresh: null, refreshCalls: 0 };
  refreshClient.defaults.adapter = async (config) => {
    script.refreshCalls++;
    return script.refresh(config);
  };
  api.defaults.adapter = async (config) => {
    script.calls.push({ url: config.url, auth: config.headers.Authorization, tz: config.headers["X-Timezone"] });
    return script.handler(config);
  };
});

describe("api client", () => {
  it("attaches the in-memory token and the time zone, and never touches localStorage", async () => {
    script.handler = async (c) => ({ ...reply(200, { ok: true }), config: c });
    setAccessToken("abc");
    await api.get("/habits");
    expect(script.calls[0].auth).toBe("Bearer abc");
    expect(script.calls[0].tz).toBeTruthy();
    expect(localStorage.length).toBe(0);
  });

  it("sends no Authorization header when logged out", async () => {
    script.handler = async (c) => ({ ...reply(200), config: c });
    await api.get("/habits");
    expect(script.calls[0].auth).toBeUndefined();
  });

  it("does NOT log out on a wrong-password 401 from /auth/login", async () => {
    const onLogout = vi.fn();
    window.addEventListener("momentum:logout", onLogout);
    script.handler = (c) => fail(c, 401, { message: "Invalid email or password" });
    await expect(api.post("/auth/login", {})).rejects.toBeTruthy();
    expect(onLogout).not.toHaveBeenCalled();
    window.removeEventListener("momentum:logout", onLogout);
  });

  it("on 401 refreshes once, retries the request with the new token, and the caller never sees the 401", async () => {
    setAccessToken("expired");
    script.handler = async (c) => {
      if (c.url === "/habits" && c.headers.Authorization === "Bearer expired") return fail(c, 401);
      if (c.url === "/habits") return { ...reply(200, { habits: [] }), config: c };
      throw new Error("unexpected " + c.url);
    };
    script.refresh = async (config) => ({ ...reply(200, { token: "fresh", user: { id: 1 } }), config });
    const res = await api.get("/habits");
    expect(res.data).toEqual({ habits: [] });
    expect(script.refreshCalls).toBe(1);
    expect(getAccessToken()).toBe("fresh");
    expect(script.calls.at(-1).auth).toBe("Bearer fresh");
  });

  it("concurrent 401s share a single refresh request (single-flight)", async () => {
    setAccessToken("expired");
    script.handler = async (c) =>
      c.headers.Authorization === "Bearer expired" ? fail(c, 401) : { ...reply(200, { ok: c.url }), config: c };
    script.refresh = async (config) => {
      await new Promise((r) => setTimeout(r, 20));
      return { ...reply(200, { token: "fresh", user: {} }), config };
    };
    const results = await Promise.all([api.get("/a"), api.get("/b"), api.get("/c")]);
    expect(results.map((r) => r.data.ok)).toEqual(["/a", "/b", "/c"]);
    expect(script.refreshCalls).toBe(1);
  });

  it("logs the user out when the refresh itself is rejected", async () => {
    setAccessToken("expired");
    const onLogout = vi.fn();
    window.addEventListener("momentum:logout", onLogout);
    script.handler = (c) => fail(c, 401);
    script.refresh = (config) => fail(config, 401);
    await expect(api.get("/habits")).rejects.toBeTruthy();
    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBeNull();
    window.removeEventListener("momentum:logout", onLogout);
  });

  it("does NOT log out when the refresh fails because the network is down", async () => {
    setAccessToken("expired");
    const onLogout = vi.fn();
    window.addEventListener("momentum:logout", onLogout);
    script.handler = (c) => fail(c, 401);
    script.refresh = async () => {
      throw new Error("Network Error");
    };
    await expect(api.get("/habits")).rejects.toBeTruthy();
    expect(onLogout).not.toHaveBeenCalled();
    expect(getAccessToken()).toBe("expired"); // still holds its (expired) token; will retry on the next request
    window.removeEventListener("momentum:logout", onLogout);
  });

  it("retries once when another tab rotated the cookie a moment ago (REFRESH_RACE)", async () => {
    setAccessToken("expired");
    script.handler = async (c) => (c.headers.Authorization === "Bearer expired" ? fail(c, 401) : { ...reply(200, { ok: 1 }), config: c });
    let n = 0;
    script.refresh = async (config) => (++n === 1 ? fail(config, 401, { code: "REFRESH_RACE" }) : { ...reply(200, { token: "fresh", user: {} }), config });
    const res = await api.get("/habits");
    expect(res.data).toEqual({ ok: 1 });
    expect(script.refreshCalls).toBe(2);
  });

  it("gives up after one retry so it can never loop forever", async () => {
    setAccessToken("expired");
    let handled = 0;
    script.handler = (c) => (handled++, fail(c, 401));
    script.refresh = async (config) => ({ ...reply(200, { token: "fresh", user: {} }), config });
    await expect(api.get("/habits")).rejects.toBeTruthy();
    expect(handled).toBe(2); // original + exactly one replay
  });
});
