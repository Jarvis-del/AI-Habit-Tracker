import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { bootstrap, makeApi, registerUser } from "../helpers/setup.js";
import RefreshToken from "../../src/models/RefreshToken.js";
import User from "../../src/models/User.js";
import { hashToken, REFRESH_COOKIE } from "../../src/utils/generateToken.js";

let ctx, api;
const XHR = { "X-Requested-With": "XMLHttpRequest" };
const cookieValue = (res, name = REFRESH_COOKIE) => {
  const line = (res.headers["set-cookie"] || []).find((c) => c.startsWith(`${name}=`));
  return line?.split(";")[0].split("=")[1];
};

beforeAll(async () => {
  ctx = await bootstrap({ AUTH_RATE_LIMIT_MAX: "1000", REGISTER_RATE_LIMIT_MAX: "1000" }); // rate limiting has its own test file
  api = makeApi(ctx.app);
});
afterAll(() => ctx.close());

describe("registration", () => {
  const good = { name: "Asha", email: "asha@example.com", password: "password123" };

  it.each([
    ["missing name", { ...good, name: "" }, /required/i],
    ["invalid email", { ...good, email: "not-an-email" }, /valid email/i],
    ["short password", { ...good, password: "abc12" }, /at least 8/],
    ["password without a number", { ...good, password: "onlyletters" }, /letter and one number/],
    ["password without a letter", { ...good, password: "12345678" }, /letter and one number/],
    ["password over bcrypt's 72-byte limit", { ...good, password: "a1".repeat(40) }, /at most 72/],
  ])("rejects %s with 400 and a clear message", async (_label, body, message) => {
    const res = await api.post("/auth/register", { body });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(message);
  });

  it("creates the account, normalises the email and never returns the password", async () => {
    const res = await api.post("/auth/register", { body: { ...good, email: "  ASHA@Example.com " } });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe("asha@example.com");
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
    expect(typeof res.body.token).toBe("string");
  });

  it("rejects a duplicate email", async () => {
    const res = await api.post("/auth/register", { body: good });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already exists/);
  });

  it("stores a bcrypt hash (cost 12 by default), not the password", async () => {
    const saved = process.env.BCRYPT_ROUNDS;
    delete process.env.BCRYPT_ROUNDS;
    const u = await User.create({ name: "H", email: "hash@example.com", password: "password123" });
    process.env.BCRYPT_ROUNDS = saved;
    expect(u.password).not.toBe("password123");
    expect(u.password).toMatch(/^\$2[aby]\$12\$/);
  });
});

describe("login", () => {
  it("logs in (case-insensitive email) and sets an httpOnly refresh cookie", async () => {
    const res = await api.post("/auth/login", { body: { email: "ASHA@example.com", password: "password123" } });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    const cookie = res.headers["set-cookie"].find((c) => c.startsWith(`${REFRESH_COOKIE}=`));
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
    expect(res.body.refreshToken).toBeUndefined(); // never exposed to JavaScript
  });

  it("gives the same 401 for a wrong password and an unknown email (no user enumeration)", async () => {
    const wrong = await api.post("/auth/login", { body: { email: "asha@example.com", password: "wrongpass1" } });
    const unknown = await api.post("/auth/login", { body: { email: "ghost@example.com", password: "wrongpass1" } });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.message).toBe(unknown.body.message);
  });

  it("returns 400 when fields are missing", async () => {
    expect((await api.post("/auth/login", { body: { email: "asha@example.com" } })).status).toBe(400);
  });

  it("stores only a hash of the refresh token", async () => {
    const res = await api.post("/auth/login", { body: { email: "asha@example.com", password: "password123" } });
    const raw = cookieValue(res);
    expect(await RefreshToken.findOne({ tokenHash: raw })).toBeNull();
    expect(await RefreshToken.findOne({ tokenHash: hashToken(raw) })).not.toBeNull();
  });
});

describe("access tokens", () => {
  let user;
  beforeAll(async () => (user = await registerUser(ctx.app)));

  it("accepts a valid token", async () => {
    const res = await api.get("/auth/me", { token: user.token });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(user.email);
  });

  it("is short-lived (15 minutes by default)", () => {
    const { iat, exp } = jwt.decode(user.token);
    expect(exp - iat).toBe(15 * 60);
  });

  it.each([
    ["no token", undefined],
    ["garbage", "garbage.token.value"],
    ["the string 'undefined'", "undefined"],
    ["signed with the wrong secret", jwt.sign({ id: "507f1f77bcf86cd799439011" }, "another-secret")],
    ["expired", jwt.sign({ id: "507f1f77bcf86cd799439011" }, "test_secret_that_is_long_enough_for_hs256_0123456789", { expiresIn: -10 })],
    ["alg=none forgery", jwt.sign({ id: "507f1f77bcf86cd799439011" }, "", { algorithm: "none" })],
  ])("rejects %s with 401", async (_label, token) => {
    expect((await api.get("/auth/me", { token })).status).toBe(401);
  });

  it("rejects a valid token whose user was deleted", async () => {
    const tmp = await registerUser(ctx.app);
    await User.deleteOne({ email: tmp.email });
    expect((await api.get("/auth/me", { token: tmp.token })).status).toBe(401);
  });
});

describe("refresh-token rotation", () => {
  it("requires the X-Requested-With header (CSRF defence)", async () => {
    const u = await registerUser(ctx.app);
    expect((await u.agent.post("/api/v1/auth/refresh")).status).toBe(403);
  });

  it("returns 401 with no cookie", async () => {
    expect((await request(ctx.app).post("/api/v1/auth/refresh").set(XHR)).status).toBe(401);
  });

  it("issues a new access token and rotates the cookie", async () => {
    const u = await registerUser(ctx.app);
    const before = (await RefreshToken.find({ user: u.user.id }))[0];
    const res = await u.agent.post("/api/v1/auth/refresh").set(XHR);
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe(u.email);
    expect(cookieValue(res)).toBeTruthy();

    const docs = await RefreshToken.find({ user: u.user.id }).sort({ createdAt: 1 });
    expect(docs).toHaveLength(2);
    expect(docs[0].revokedAt).not.toBeNull(); // old token is single-use
    expect(docs[1].revokedAt).toBeNull();
    expect(docs[1].family).toBe(before.family); // same login family
    // and the new access token works
    expect((await api.get("/auth/me", { token: res.body.token })).status).toBe(200);
  });

  it("treats an immediate replay as a benign race (tell client to retry) without killing the session", async () => {
    const u = await registerUser(ctx.app);
    const oldCookie = u.agent.jar.getCookies({ path: "/api/v1/auth", domain: "127.0.0.1", secure: false, script: false })[0]?.value
      ?? cookieValue(await api.post("/auth/login", { body: { email: u.email, password: u.password } }));
    await u.agent.post("/api/v1/auth/refresh").set(XHR); // rotates; cookie jar now holds the NEW token
    const replay = await request(ctx.app).post("/api/v1/auth/refresh").set(XHR).set("Cookie", `${REFRESH_COOKIE}=${oldCookie}`);
    expect(replay.status).toBe(401);
    expect(replay.body.code).toBe("REFRESH_RACE");
    // the legitimate (new) cookie still works
    expect((await u.agent.post("/api/v1/auth/refresh").set(XHR)).status).toBe(200);
  });

  it("detects token REUSE long after rotation and revokes the whole family", async () => {
    const u = await registerUser(ctx.app);
    const stolen = (await RefreshToken.find({ user: u.user.id }))[0];
    // we need the raw value of the first token: log in on a fresh agent so we can capture it
    const login = await request(ctx.app).post("/api/v1/auth/login").send({ email: u.email, password: u.password });
    const oldRaw = cookieValue(login);
    const legit = request.agent(ctx.app);
    const first = await legit.post("/api/v1/auth/refresh").set(XHR).set("Cookie", `${REFRESH_COOKIE}=${oldRaw}`);
    expect(first.status).toBe(200);
    const newRaw = cookieValue(first);
    // pretend the rotation happened a minute ago (outside the 10s race window)
    await RefreshToken.updateOne({ tokenHash: hashToken(oldRaw) }, { revokedAt: new Date(Date.now() - 60_000) });

    const attacker = await request(ctx.app).post("/api/v1/auth/refresh").set(XHR).set("Cookie", `${REFRESH_COOKIE}=${oldRaw}`);
    expect(attacker.status).toBe(401);
    expect(attacker.body.code).toBeUndefined();

    // the victim's newest token was in the same family, so it is now dead too
    const victim = await request(ctx.app).post("/api/v1/auth/refresh").set(XHR).set("Cookie", `${REFRESH_COOKIE}=${newRaw}`);
    expect(victim.status).toBe(401);
    expect(stolen).toBeTruthy();
  });

  it("rejects an expired refresh token", async () => {
    const u = await registerUser(ctx.app);
    await RefreshToken.updateMany({ user: u.user.id }, { expiresAt: new Date(Date.now() - 1000) });
    expect((await u.agent.post("/api/v1/auth/refresh").set(XHR)).status).toBe(401);
  });

  it("rejects a random cookie value", async () => {
    const res = await request(ctx.app).post("/api/v1/auth/refresh").set(XHR).set("Cookie", `${REFRESH_COOKIE}=totally-made-up`);
    expect(res.status).toBe(401);
  });

  it("two simultaneous refreshes with the same cookie: exactly one succeeds", async () => {
    const u = await registerUser(ctx.app);
    const raw = (await RefreshToken.find({ user: u.user.id }))[0];
    const login = await request(ctx.app).post("/api/v1/auth/login").send({ email: u.email, password: u.password });
    const cookie = `${REFRESH_COOKIE}=${cookieValue(login)}`;
    const results = await Promise.all([1, 2, 3].map(() => request(ctx.app).post("/api/v1/auth/refresh").set(XHR).set("Cookie", cookie)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(raw).toBeTruthy();
  });
});

describe("logout", () => {
  it("revokes the session and clears the cookie", async () => {
    const u = await registerUser(ctx.app);
    const res = await u.agent.post("/api/v1/auth/logout").set(XHR);
    expect(res.status).toBe(200);
    expect(res.headers["set-cookie"].join(";")).toMatch(new RegExp(`${REFRESH_COOKIE}=;`));
    expect((await u.agent.post("/api/v1/auth/refresh").set(XHR)).status).toBe(401);
  });

  it("is idempotent and requires the CSRF header", async () => {
    expect((await request(ctx.app).post("/api/v1/auth/logout").set(XHR)).status).toBe(200);
    expect((await request(ctx.app).post("/api/v1/auth/logout")).status).toBe(403);
  });

  it("logout-all revokes every device", async () => {
    const a = await registerUser(ctx.app);
    const phone = request.agent(ctx.app);
    await phone.post("/api/v1/auth/login").send({ email: a.email, password: a.password });
    expect((await api.post("/auth/logout-all", { token: a.token })).status).toBe(200);
    expect((await a.agent.post("/api/v1/auth/refresh").set(XHR)).status).toBe(401);
    expect((await phone.post("/api/v1/auth/refresh").set(XHR)).status).toBe(401);
  });

  it("logout-all requires authentication", async () => {
    expect((await api.post("/auth/logout-all")).status).toBe(401);
  });
});

describe("change password", () => {
  it("validates input", async () => {
    const u = await registerUser(ctx.app);
    const call = (body) => api.post("/auth/change-password", { token: u.token, body });
    expect((await call({ currentPassword: "wrong-pass1", newPassword: "newpassword1" })).status).toBe(400); // not 401!
    expect((await call({ currentPassword: u.password, newPassword: "short1" })).status).toBe(400);
    expect((await call({ currentPassword: u.password, newPassword: "nodigitshere" })).status).toBe(400);
    expect((await call({ currentPassword: u.password, newPassword: u.password })).status).toBe(400);
    expect((await api.post("/auth/change-password", { body: { currentPassword: "a", newPassword: "b" } })).status).toBe(401);
  });

  it("changes the password, signs out other devices and rejects older access tokens", async () => {
    const u = await registerUser(ctx.app);
    const other = request.agent(ctx.app);
    await other.post("/api/v1/auth/login").send({ email: u.email, password: u.password });
    const staleToken = jwt.sign({ id: u.user.id, iat: Math.floor(Date.now() / 1000) - 120 }, process.env.JWT_SECRET, { expiresIn: "15m" });
    expect((await api.get("/auth/me", { token: staleToken })).status).toBe(200); // fine before the change

    const res = await api.post("/auth/change-password", { token: u.token, body: { currentPassword: u.password, newPassword: "brandnew123" }, agent: u.agent });
    expect(res.status).toBe(200);

    expect((await api.post("/auth/login", { body: { email: u.email, password: u.password } })).status).toBe(401); // old password dead
    expect((await api.post("/auth/login", { body: { email: u.email, password: "brandnew123" } })).status).toBe(200);
    expect((await other.post("/api/v1/auth/refresh").set(XHR)).status).toBe(401); // other device signed out
    expect((await api.get("/auth/me", { token: staleToken })).status).toBe(401); // pre-change token rejected
    expect((await api.get("/auth/me", { token: res.body.token })).status).toBe(200); // this device continues
    expect((await u.agent.post("/api/v1/auth/refresh").set(XHR)).status).toBe(200);
  });
});

describe("settings", () => {
  it("only updates whitelisted fields", async () => {
    const u = await registerUser(ctx.app);
    const res = await api.patch("/auth/settings", { token: u.token, body: { theme: "dark", email: "hacker@evil.com", password: "x", isAdmin: true } });
    expect(res.status).toBe(200);
    expect(res.body.user.settings.theme).toBe("dark");
    expect(res.body.user.email).toBe(u.email);
    expect(mongoose.connection.readyState).toBe(1);
  });
});
