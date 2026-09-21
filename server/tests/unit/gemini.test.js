import { describe, it, expect } from "vitest";
import { extractJson, getModelChain, isGeminiConfigured } from "../../src/config/gemini.js";

describe("extractJson", () => {
  it("parses plain JSON", () => expect(extractJson('{"a":1}')).toEqual({ a: 1 }));
  it("strips ```json fences", () => expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 }));
  it("finds JSON surrounded by chatter", () => expect(extractJson('Sure! Here you go: {"a":[1,2]} hope that helps')).toEqual({ a: [1, 2] }));
  it("parses top-level arrays", () => expect(extractJson("[1,2,3]")).toEqual([1, 2, 3]));
  it("returns null for garbage / empty", () => {
    expect(extractJson("no json here")).toBeNull();
    expect(extractJson("")).toBeNull();
    expect(extractJson(null)).toBeNull();
    expect(extractJson("{broken")).toBeNull();
  });
});

describe("model configuration", () => {
  it("defaults to gemini-2.5-flash with a fallback", () => {
    const saved = { m: process.env.GEMINI_MODEL, f: process.env.GEMINI_FALLBACK_MODELS };
    delete process.env.GEMINI_MODEL; delete process.env.GEMINI_FALLBACK_MODELS;
    const chain = getModelChain();
    expect(chain[0]).toBe("gemini-2.5-flash");
    expect(chain.length).toBeGreaterThan(1);
    Object.assign(process.env, Object.fromEntries(Object.entries({ GEMINI_MODEL: saved.m, GEMINI_FALLBACK_MODELS: saved.f }).filter(([, v]) => v !== undefined)));
  });

  it("honours GEMINI_MODEL / GEMINI_FALLBACK_MODELS and removes duplicates", () => {
    process.env.GEMINI_MODEL = "my-model";
    process.env.GEMINI_FALLBACK_MODELS = "b, my-model ,c";
    expect(getModelChain()).toEqual(["my-model", "b", "c"]);
    delete process.env.GEMINI_MODEL; delete process.env.GEMINI_FALLBACK_MODELS;
  });

  it("treats the .env.example placeholder as 'not configured'", () => {
    const saved = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = "your_google_gemini_api_key_here";
    expect(isGeminiConfigured()).toBe(false);
    process.env.GEMINI_API_KEY = "";
    expect(isGeminiConfigured()).toBe(false);
    process.env.GEMINI_API_KEY = "AIzaSomething";
    expect(isGeminiConfigured()).toBe(true);
    if (saved === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = saved;
  });
});
