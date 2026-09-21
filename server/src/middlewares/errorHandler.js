import { logger } from "../utils/logger.js";

// Catches errors thrown/passed via next(err) from any route or middleware.
// Translates common library errors into proper 4xx responses instead of blanket 500s.
export const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal server error";

  if (err.name === "ValidationError" && err.errors) {
    // Mongoose schema validation
    statusCode = 400;
    message = Object.values(err.errors)
      .map((e) => e.message.replace(/Path `(\w+)`/, "$1"))
      .join(". ");
  } else if (err.name === "CastError") {
    statusCode = 400;
    message = `Invalid value for "${err.path}"`;
  } else if (err.code === 11000) {
    statusCode = 409;
    message = "That value already exists.";
  } else if (err.type === "entity.parse.failed") {
    statusCode = 400;
    message = "Request body is not valid JSON.";
  } else if (err.type === "entity.too.large") {
    statusCode = 413;
    message = "Request body is too large.";
  }

  if (statusCode >= 500) {
    logger.error(err.stack || err.message);
    if (!err.statusCode && process.env.NODE_ENV === "production") {
      message = "Internal server error";
    }
  }

  res.status(statusCode).json({ success: false, message });
};

export const notFound = (req, res, next) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.originalUrl}` });
};
