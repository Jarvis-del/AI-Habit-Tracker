import mongoose from "mongoose";
import request from "supertest";
import { startMockGemini } from "./mockGemini.js";

const uri = process.env.TEST_MONGODB_URI || "mongodb://127.0.0.1:27017/habit-tracker-test";

/**
 * Boots the real Express app against a throw-away database + a fake Gemini server.
 * `env` lets a test file tweak configuration BEFORE the app is imported (limits are read at import).
 */
export async function bootstrap(env = {}) {
  const dbName = new URL(uri).pathname.replace("/", "");
  // this suite drops the database - never let it near real data
  if (!/test/i.test(dbName)) {
    throw new Error(`Refusing to run tests: database name "${dbName}" must contain "test". Set TEST_MONGODB_URI.`);
  }

  const mock = await startMockGemini();
  Object.assign(process.env, {
    NODE_ENV: "test",
    JWT_SECRET: "test_secret_that_is_long_enough_for_hs256_0123456789",
    BCRYPT_ROUNDS: "4", // fast hashing in tests only
    GEMINI_RETRY_DELAY_MS: "1", // no real waiting between retries in tests
    GEMINI_API_KEY: "AIzaTestKey_for_unit_tests",
    GEMINI_BASE_URL: mock.url,
    CLIENT_URL: "http://localhost:5173",
    ...env,
  });

  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  const { default: app } = await import("../../src/app.js");
  // build indexes (unique constraints matter for the tests). Stand-in databases such as FerretDB
  // don't implement TTL indexes; that specific error is ignored, anything else still fails.
  await Promise.all(
    Object.values(mongoose.models).map((m) =>
      m.init().catch((err) => {
        if (!/not implemented/i.test(err.message)) throw err;
      })
    )
  );

  return {
    app,
    mock,
    async close() {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
      await mock.close();
    },
  };
}

/** Thin wrapper so tests read like `api.post("/habits", { token, body })`. */
export function makeApi(app) {
  const call = (method) => (path, { token, body, headers = {}, agent } = {}) => {
    const r = (agent || request(app))[method](`/api/v1${path}`).set("X-Timezone", "UTC");
    if (token) r.set("Authorization", `Bearer ${token}`);
    for (const [k, v] of Object.entries(headers)) r.set(k, v);
    return body === undefined ? r : r.send(body);
  };
  return { get: call("get"), post: call("post"), patch: call("patch"), del: call("delete") };
}

let counter = 0;
/** Registers a fresh user and returns its token + an agent that holds the refresh cookie. */
export async function registerUser(app, overrides = {}) {
  const agent = request.agent(app);
  const email = overrides.email || `user${++counter}_${Date.now()}@example.com`;
  const res = await agent
    .post("/api/v1/auth/register")
    .send({ name: "Test User", email, password: "password123", ...overrides });
  if (res.status !== 201) throw new Error(`registerUser failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.token, user: res.body.user, email, password: overrides.password || "password123", agent };
}

/** YYYY-MM-DD for N days before "today" in UTC (tests send X-Timezone: UTC). */
export const daysAgo = (n) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
