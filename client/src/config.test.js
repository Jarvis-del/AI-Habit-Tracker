import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Regression guards for the mistakes that broke the original project.
describe("project configuration", () => {
  it("has NO postcss.config.js (Tailwind v4 loads through the Vite plugin; a bad PostCSS config blanked the whole app)", () => {
    expect(existsSync(path.join(root, "postcss.config.js"))).toBe(false);
  });

  it("stores no tokens in localStorage", () => {
    const api = readFileSync(path.join(root, "src/services/api.js"), "utf8");
    const auth = readFileSync(path.join(root, "src/context/AuthContext.jsx"), "utf8");
    expect(api).not.toMatch(/localStorage\.setItem/);
    expect(auth).not.toMatch(/setItem\(["']momentum_token/);
  });

  it("does not import the whole lucide icon set (bundle bloat)", () => {
    for (const f of ["src/utils/constants.js", "src/components/HabitChecklist.jsx", "src/pages/Insights.jsx"]) {
      expect(readFileSync(path.join(root, f), "utf8")).not.toMatch(/^import \* as \w+ from ["']lucide-react["']/m);
    }
  });
});
