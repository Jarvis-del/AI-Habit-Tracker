import mongoose from "mongoose";
import { logger } from "../utils/logger.js";

export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      // Fail fast (instead of hanging for 30s) so a bad URI / blocked IP is obvious
      serverSelectionTimeoutMS: 10_000,
    });
    logger.info(`MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    logger.error(`MongoDB connection error: ${err.message}`);
    if (/whitelist|not authorized|IP|ReplicaSetNoPrimary|Server selection timed out/i.test(err.message)) {
      logger.error(
        "  -> On MongoDB Atlas: Network Access -> add your current IP address (or 0.0.0.0/0 for development)."
      );
    }
    if (/querySrv|ENOTFOUND|ECONNREFUSED/i.test(err.message) && process.env.MONGODB_URI?.startsWith("mongodb+srv")) {
      logger.error(
        "  -> DNS lookup for the mongodb+srv:// address failed. Some ISPs/networks block SRV lookups: " +
          "try another network / DNS (e.g. 8.8.8.8), or use Atlas's non-SRV 'standard connection string'."
      );
    }
    if (/Authentication failed|bad auth/i.test(err.message)) {
      logger.error("  -> Wrong database username/password in MONGODB_URI (special characters must be URL-encoded).");
    }
    process.exit(1);
  }
};
