// NoSQL-injection / prototype-pollution guard.
// Strips any key that starts with "$" (MongoDB operators such as {"$gt": ""}) or contains "."
// (path traversal into documents), plus __proto__/constructor/prototype, from every part of the
// request that user code can read. Runs before any controller sees the data.
const FORBIDDEN = new Set(["__proto__", "constructor", "prototype"]);

const isBadKey = (key) => key.startsWith("$") || key.includes(".") || FORBIDDEN.has(key);

export function sanitizeValue(value) {
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (value && typeof value === "object") {
    const clean = {};
    for (const [key, v] of Object.entries(value)) {
      if (isBadKey(key)) continue;
      clean[key] = sanitizeValue(v);
    }
    return clean;
  }
  return value;
}

export const sanitizeRequest = (req, res, next) => {
  if (req.body) req.body = sanitizeValue(req.body);
  if (req.query) req.query = sanitizeValue(req.query);
  if (req.params) req.params = sanitizeValue(req.params);
  next();
};
