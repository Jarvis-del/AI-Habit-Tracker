import { describe, it, expect } from "vitest";
import { getErrorMessage } from "./errors.js";

describe("getErrorMessage", () => {
  it("prefers the server's message", () => {
    expect(getErrorMessage({ response: { status: 503, data: { message: "AI is not configured" } } })).toBe("AI is not configured");
  });
  it("explains an unreachable API (empty proxy 500/502/504 or no response)", () => {
    for (const status of [500, 502, 503, 504]) expect(getErrorMessage({ response: { status, data: "" } })).toMatch(/backend running/);
    expect(getErrorMessage({ request: {} })).toMatch(/backend running/);
  });
  it("explains timeouts", () => {
    expect(getErrorMessage({ code: "ECONNABORTED" })).toMatch(/timed out/);
  });
  it("falls back to the provided text with the status code", () => {
    expect(getErrorMessage({ response: { status: 418, data: {} } }, "Nope")).toBe("Nope (HTTP 418)");
    expect(getErrorMessage(new Error("boom"))).toBe("boom");
    expect(getErrorMessage(undefined, "fallback")).toBe("fallback");
  });
});
