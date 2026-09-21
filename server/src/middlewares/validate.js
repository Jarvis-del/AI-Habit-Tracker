import { BadRequestError } from "../utils/errorClasses.js";

// Simple field-presence validator middleware factory.
// Usage: validate(['email', 'password'])
export const validate = (requiredFields = []) => {
  return (req, res, next) => {
    const missing = requiredFields.filter((field) => {
      const value = req.body?.[field];
      return value === undefined || value === null || value === "";
    });
    if (missing.length > 0) {
      return next(new BadRequestError(`Missing required field(s): ${missing.join(", ")}`));
    }
    next();
  };
};
