import { describe, it, expect } from "vitest";
import { sanitizeValue, sanitizeRequest } from "../../src/middlewares/sanitize.js";

describe("sanitizeValue (NoSQL injection / prototype pollution guard)", () => {
  it("removes $operators at any depth", () => {
    expect(sanitizeValue({ email: { $gt: "" }, ok: 1 })).toEqual({ email: {}, ok: 1 });
    expect(sanitizeValue({ a: { b: { $ne: null, keep: true } } })).toEqual({ a: { b: { keep: true } } });
  });

  it("removes dotted keys", () => {
    expect(sanitizeValue({ "profile.role": "admin", name: "x" })).toEqual({ name: "x" });
  });

  it("removes prototype-pollution keys", () => {
    const evil = JSON.parse('{"__proto__": {"isAdmin": true}, "constructor": {"x": 1}, "prototype": 1, "safe": 1}');
    const clean = sanitizeValue(evil);
    expect(clean).toEqual({ safe: 1 });
    expect({}.isAdmin).toBeUndefined();
  });

  it("sanitizes inside arrays and leaves primitives alone", () => {
    expect(sanitizeValue([{ $where: "1" }, "text", 5, null])).toEqual([{}, "text", 5, null]);
    expect(sanitizeValue("plain")).toBe("plain");
    expect(sanitizeValue(null)).toBeNull();
  });

  it("does not mutate legitimate data", () => {
    const input = { name: "Run", targetFrequency: { type: "weekly", timesPerWeek: 3 }, tags: ["a", "b"] };
    expect(sanitizeValue(input)).toEqual(input);
  });

  it("middleware cleans body, query and params", () => {
    const req = { body: { a: { $gt: 1 } }, query: { b: { $ne: 1 } }, params: { c: "x" } };
    let called = false;
    sanitizeRequest(req, {}, () => (called = true));
    expect(called).toBe(true);
    expect(req).toEqual({ body: { a: {} }, query: { b: {} }, params: { c: "x" } });
  });
});
