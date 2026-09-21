// IMPORTANT: this must be the very first import. ES module imports are hoisted and
// evaluated in order, so loading .env here guarantees every other module (Gemini
// client, JWT helpers, DB config...) can see process.env when it is evaluated.
import "dotenv/config";

import app from "./src/app.js";
import { connectDB } from "./src/config/db.js";
import { logger } from "./src/utils/logger.js";

const PORT = process.env.PORT || 5000;

const REQUIRED_ENV = ["MONGODB_URI", "JWT_SECRET"];

function checkEnv() {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]?.trim());
  if (missing.length) {
    logger.error(
      `Missing required environment variable(s): ${missing.join(", ")}.\n` +
        `  -> Copy server/.env.example to server/.env, fill it in, and restart.`
    );
    process.exit(1);
  }
  if (process.env.NODE_ENV === "production" && process.env.JWT_SECRET.length < 32) {
    logger.error("JWT_SECRET must be at least 32 characters in production (try: openssl rand -base64 48).");
    process.exit(1);
  }
  if (process.env.JWT_SECRET.length < 16) {
    logger.warn("JWT_SECRET is short - use a long random string.");
  }
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key || key === "your_google_gemini_api_key_here") {
    logger.warn(
      "GEMINI_API_KEY is not set - the app will run, but all AI features will return an error until you add it to server/.env and restart."
    );
  }
}

const start = async () => {
  checkEnv();
  await connectDB();

  const server = app.listen(PORT, () => {
    logger.info(`Server running on http://localhost:${PORT}`);
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      logger.error(
        `Port ${PORT} is already in use. Stop the other process or set a different PORT in server/.env ` +
          `(and set VITE_API_PROXY_TARGET in client/.env to match). On macOS, "AirPlay Receiver" uses port 5000.`
      );
    } else {
      logger.error(err.message);
    }
    process.exit(1);
  });
};

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection:", reason instanceof Error ? reason.stack : reason);
});

start();
