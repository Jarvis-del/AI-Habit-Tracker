import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/auth.js";
import habitRoutes from "./routes/habits.js";
import logRoutes from "./routes/logs.js";
import aiRoutes from "./routes/ai.js";
import { errorHandler, notFound } from "./middlewares/errorHandler.js";
import { rateLimiter } from "./middlewares/rateLimiter.js";
import { sanitizeRequest } from "./middlewares/sanitize.js";
import { isGeminiConfigured, getModelChain } from "./config/gemini.js";

const app = express();
app.disable("x-powered-by");
if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);

// CLIENT_URL may be a comma-separated list, e.g. "http://localhost:5173,http://127.0.0.1:5173"
const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:5173,http://127.0.0.1:5173")
  .split(",")
  .map((o) => o.trim().replace(/\/$/, ""))
  .filter(Boolean);

// --- Core middleware ---
app.use(helmet()); // secure HTTP headers (nosniff, frame denial, HSTS, no referrer leaks...)
app.use(
  cors({
    origin: (origin, cb) => {
      // no Origin header = curl / same-origin proxy / server-to-server
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());
app.use(sanitizeRequest); // strips $operators / dotted keys / __proto__ (NoSQL injection)
app.use(rateLimiter({ windowMs: 60_000, max: 300 })); // general app-wide, per-IP limit

// --- Health check ---
app.get("/api/v1/health", (req, res) => {
  res.json({
    success: true,
    status: "ok",
    timestamp: new Date().toISOString(),
    ai: { configured: isGeminiConfigured(), models: getModelChain() },
  });
});

// --- API routes ---
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/habits", habitRoutes);
app.use("/api/v1/logs", logRoutes);
app.use("/api/v1/ai", aiRoutes);

// --- 404 + error handling (must be last) ---
app.use(notFound);
app.use(errorHandler);

export default app;
