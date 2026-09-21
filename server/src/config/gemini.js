import { GoogleGenAI } from "@google/genai";
import { ApiError } from "../utils/errorClasses.js";
import { logger } from "../utils/logger.js";

/**
 * Gemini access layer used by every AI controller.
 *
 * Design notes (these fix the "AI features not working" bug):
 *  - The client is created LAZILY on first use. It used to be created at import time, which
 *    (because ES imports are hoisted above dotenv.config()) happened before .env was loaded, so
 *    the SDK saw apiKey === undefined and fell back to "Google Application Default
 *    Credentials" -> "Could not load the default credentials".
 *  - Upstream failures are translated into clear messages + safe HTTP statuses. We NEVER pass a
 *    Gemini 401/403 through as a 401, because the frontend treats 401 as "your login expired"
 *    and would log the user out.
 *  - The model is configurable and there is an optional fallback chain, because Google retires
 *    model IDs over time.
 */

const PLACEHOLDER_KEY = "your_google_gemini_api_key_here";
export const DEFAULT_MODEL = "gemini-2.5-flash";
const DEFAULT_FALLBACKS = "gemini-3.6-flash,gemini-2.5-flash-lite";

let client = null;
let clientSignature = null;
// Models Google reported as retired/not found are skipped for a while (not forever: Google has been seen
// returning premature "no longer available" errors, so a single one must not disable a model until restart).
const deadModels = new Map(); // model -> time (ms) until which it is skipped
const DEAD_TTL_MS = () => intEnv("GEMINI_DEAD_MODEL_TTL_MS", 10 * 60_000);
const isDead = (model) => {
  const until = deadModels.get(model);
  if (until && until > Date.now()) return true;
  deadModels.delete(model);
  return false;
};
/** Test helper: forget all runtime state (dead models, cached client). */
export const resetGeminiState = () => {
  deadModels.clear();
  client = null;
  clientSignature = null;
};

const intEnv = (name, fallback) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const isGeminiConfigured = () => {
  const key = process.env.GEMINI_API_KEY?.trim();
  return Boolean(key && key !== PLACEHOLDER_KEY);
};

export const getModelChain = () => {
  const primary = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  const fallbacks = (process.env.GEMINI_FALLBACK_MODELS ?? DEFAULT_FALLBACKS)
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return [...new Set([primary, ...fallbacks])];
};

function getClient() {
  if (!isGeminiConfigured()) {
    throw new ApiError(
      503,
      "AI is not configured: add a valid GEMINI_API_KEY to server/.env and restart the server."
    );
  }
  const apiKey = process.env.GEMINI_API_KEY.trim();
  const baseUrl = process.env.GEMINI_BASE_URL?.trim(); // optional: proxy / local mock for tests
  const timeout = Number(process.env.GEMINI_TIMEOUT_MS) || 20_000; // per attempt; overloaded models sometimes hang instead of erroring
  const signature = `${apiKey}|${baseUrl || ""}|${timeout}`;

  if (!client || clientSignature !== signature) {
    client = new GoogleGenAI({
      apiKey,
      httpOptions: { timeout, ...(baseUrl ? { baseUrl } : {}) },
    });
    clientSignature = signature;
  }
  return client;
}

/** Pull a readable {status, message} out of whatever the SDK threw. */
function describeUpstreamError(err) {
  // Only trust real HTTP status codes. (A DOMException such as AbortError has `code: 20`, which is
  // NOT an HTTP status - reading it as one made timeouts look like a "fatal" client error.)
  const asHttp = (v) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= 100 && n <= 599 ? n : undefined;
  };
  let status = asHttp(err?.status) ?? asHttp(err?.code) ?? asHttp(err?.error?.code);
  let message = String(err?.message || err || "Unknown error");
  if (err?.name === "AbortError" || err?.name === "TimeoutError") status = 504;

  // The SDK often puts the raw JSON error body into err.message
  const jsonStart = message.indexOf("{");
  if (jsonStart !== -1) {
    try {
      const parsed = JSON.parse(message.slice(jsonStart));
      const inner = parsed.error || parsed;
      if (inner?.message) message = inner.message;
      if (!status && inner?.code) status = Number(inner.code);
    } catch {
      /* not JSON - keep message as is */
    }
  }
  if (!status && /timed? ?out|ETIMEDOUT|AbortError|aborted/i.test(message)) status = 504;
  return { status, message };
}

const isModelGone = ({ status, message }) =>
  status === 404 || /no longer available|is not found|not supported for generateContent|model.*(retired|deprecated|shut ?down)/i.test(message);

/** Convert an upstream error into an ApiError with a helpful message and a SAFE status code. */
function toApiError(err, model) {
  if (err instanceof ApiError) return err;
  const { status, message } = describeUpstreamError(err);
  logger.error(`Gemini error (model=${model}, status=${status ?? "n/a"}): ${message}`);

  if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(message)) {
    return new ApiError(429, "Gemini's rate/quota limit was reached (free-tier limits are low). Wait a minute and try again.");
  }
  if (status === 400 && /API key not valid|API_KEY_INVALID|API key expired/i.test(message)) {
    return new ApiError(503, "Gemini rejected your API key as invalid. Check GEMINI_API_KEY in server/.env (no quotes/spaces) and restart the server.");
  }
  if (status === 400 && /location is not supported/i.test(message)) {
    return new ApiError(503, "Gemini API is not available for this location/network. Try a different network or enable billing in Google AI Studio.");
  }
  if (status === 401 || status === 403) {
    return new ApiError(503, `Gemini refused the request (${status}): the API key is invalid, restricted, or the Generative Language API is not enabled for it.`);
  }
  if (isModelGone({ status, message })) {
    return new ApiError(503, `Gemini model "${model}" is not available any more. Set GEMINI_MODEL in server/.env to a current model (see https://ai.google.dev/gemini-api/docs/models).`);
  }
  if (status === 504) {
    return new ApiError(504, "Gemini took too long to answer. Please try again.");
  }
  if (status && status >= 500) {
    // include Google's own words (e.g. "The model is overloaded") so the cause is visible, not hidden
    return new ApiError(502, `Gemini is temporarily unavailable (HTTP ${status}: ${message.replace(/\s+/g, " ").slice(0, 140)}). Please try again in a moment.`);
  }
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN/i.test(message)) {
    return new ApiError(502, "Could not reach the Gemini API from the server (network/firewall/DNS problem).");
  }
  return new ApiError(502, `Gemini request failed: ${message.slice(0, 200)}`);
}

/** Extract the first JSON object/array from text, tolerating ```json fences and chatter. */
export function extractJson(text) {
  if (!text) return null;
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    /* fall through to bracket matching */
  }
  const start = cleaned.search(/[{[]/);
  const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      /* give up */
    }
  }
  return null;
}

/**
 * Decide what a failure means for the retry strategy:
 *  - fatal:     bad key / permissions / bad request -> retrying can't help, fail immediately
 *  - gone:      model retired -> skip this model from now on, try the next one
 *  - quota:     429 -> quotas are per model, so try the next model
 *  - timeout:   the model hung -> don't wait again on the same model, try the next one
 *  - transient: 500/502/503/504 "model is overloaded", empty answers, dropped connections -> retry with backoff
 */
function classify(err) {
  if (err instanceof ApiError) return "transient"; // e.g. our own "empty answer" error
  const info = describeUpstreamError(err);
  if (isModelGone(info)) return "gone";
  if (info.status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(info.message)) return "quota";
  if (info.status === 504 && /timed? ?out|ETIMEDOUT|AbortError|aborted/i.test(info.message)) return "timeout";
  if (!info.status || info.status >= 500) return "transient"; // no status = network error (reset, DNS blip...)
  return "fatal";
}

async function callOnce(ai, model, { systemPrompt, contents, jsonMode }) {
  const response = await ai.models.generateContent({
    model,
    contents,
    config: {
      systemInstruction: systemPrompt,
      ...(jsonMode ? { responseMimeType: "application/json" } : {}),
    },
  });

  let text = "";
  try {
    text = response.text?.trim() || "";
  } catch {
    text = ""; // .text getter can throw when the response has no text parts
  }
  if (!text) {
    const reason = response.promptFeedback?.blockReason || response.candidates?.[0]?.finishReason;
    throw new ApiError(502, `Gemini returned an empty answer${reason ? ` (${reason})` : ""}. Please try again.`);
  }
  return jsonMode ? text.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim() : text;
}

/**
 * Calls Gemini with a system prompt + user prompt (or full `contents` for multi-turn) and returns
 * plain text. Throws ApiError (never a raw SDK error).
 *
 * Resilience (Gemini regularly answers "503 The model is overloaded"):
 *  1. transient errors are retried with exponential backoff + jitter (GEMINI_MAX_RETRIES, default 2)
 *  2. if a model stays overloaded / rate-limited / hangs, the next model in the chain is tried
 *  3. everything shares one time budget (GEMINI_TOTAL_BUDGET_MS, default 40s) so the browser
 *     request (60s timeout) never hangs
 */
export async function generateText({ systemPrompt, userPrompt, contents, jsonMode = false }) {
  const ai = getClient();
  const body = contents || [{ role: "user", parts: [{ text: userPrompt }] }];

  const retries = intEnv("GEMINI_MAX_RETRIES", 2);
  const baseDelay = intEnv("GEMINI_RETRY_DELAY_MS", 700);
  const deadline = Date.now() + intEnv("GEMINI_TOTAL_BUDGET_MS", 40_000);

  let models = getModelChain().filter((m) => !isDead(m));
  if (models.length === 0) {
    deadModels.clear(); // everything was marked dead (maybe temporarily): start over
    models = getModelChain();
  }

  const tried = [];
  let lastError = null;

  outer: for (const model of models) {
    tried.push(model);
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (Date.now() >= deadline) break outer;
      try {
        const text = await callOnce(ai, model, { systemPrompt, contents: body, jsonMode });
        if (tried.length > 1 || attempt > 0) {
          logger.info(`Gemini answered via "${model}" after ${tried.length} model(s) / ${attempt + 1} attempt(s).`);
        }
        return text;
      } catch (err) {
        lastError = toApiError(err, model); // logs model + status + Google's message
        const kind = classify(err);
        if (kind === "fatal") throw lastError;
        if (kind === "gone") {
          deadModels.set(model, Date.now() + DEAD_TTL_MS());
          continue outer;
        }
        if (kind === "quota" || kind === "timeout") continue outer;
        if (attempt < retries) {
          const backoff = baseDelay * 2 ** attempt + Math.random() * baseDelay * 0.3;
          await sleep(Math.min(backoff, Math.max(0, deadline - Date.now())));
        }
      }
    }
  }

  if (!lastError) return Promise.reject(new ApiError(504, "Gemini took too long to answer. Please try again."));
  if (tried.length > 1 && lastError.statusCode >= 500) {
    lastError.message += ` (models tried: ${tried.join(", ")})`;
  }
  throw lastError;
}
