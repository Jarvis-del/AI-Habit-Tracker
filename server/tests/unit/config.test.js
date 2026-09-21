import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Regression guards for configuration mistakes that broke the original project.
describe("startup configuration", () => {
  const serverJs = readFileSync(new URL("../../server.js", import.meta.url), "utf8");

  it("loads .env BEFORE any other import (ES imports are hoisted; otherwise env vars are undefined at import time)", () => {
    const firstImport = serverJs.split("\n").find((l) => l.startsWith("import "));
    expect(firstImport).toMatch(/import ["']dotenv\/config["']/);
  });

  it("the Gemini client is created lazily, not at import time", () => {
    const gemini = readFileSync(new URL("../../src/config/gemini.js", import.meta.url), "utf8");
    expect(gemini).not.toMatch(/export const ai\s*=\s*new GoogleGenAI/);
  });
});
