// Lightweight in-memory rate limiter - no extra dependency required.
// For production at scale, swap this for a Redis-backed limiter (e.g. rate-limiter-flexible).
//
// Every limiter owns its own store (an earlier version shared one Map between limiters, so normal
// requests used up the AI allowance).
//
// Options:
//  - keyGenerator: how requests are grouped (default: client IP)
//  - skipSuccessfulRequests: only count responses with status >= 400. Used on /auth/login so
//    legitimate logins never lock you out, while password guessing does.
export const rateLimiter = ({
  windowMs = 60_000,
  max = 60,
  keyGenerator = (req) => req.ip || req.socket?.remoteAddress || "unknown",
  message = "Too many requests, please slow down.",
  skipSuccessfulRequests = false,
} = {}) => {
  const buckets = new Map();

  // Sweep expired buckets so the Map can't grow forever
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) if (now > bucket.resetAt) buckets.delete(key);
  }, windowMs);
  sweeper.unref?.();

  return (req, res, next) => {
    if (req.method === "OPTIONS") return next();

    const key = String(keyGenerator(req));
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count++;

    if (skipSuccessfulRequests) {
      res.on("finish", () => {
        if (res.statusCode < 400 && bucket.count > 0) bucket.count--;
      });
    }

    res.setHeader("X-RateLimit-Limit", max);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, max - bucket.count));

    if (bucket.count > max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader("Retry-After", retryAfter);
      return res.status(429).json({ success: false, message: `${message} Try again in ${retryAfter}s.` });
    }
    next();
  };
};
