import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { UnauthorizedError } from "../utils/errorClasses.js";

export const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedError("No token provided");
    }
    const token = authHeader.split(" ")[1];
    if (!token || token === "undefined" || token === "null") {
      throw new UnauthorizedError("No token provided");
    }

    // Only a bad/expired TOKEN means 401. (Previously *any* failure - including a database
    // hiccup - was reported as 401, which made the frontend log the user out.)
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    } catch (err) {
      throw new UnauthorizedError(
        err.name === "TokenExpiredError" ? "Session expired, please log in again" : "Not authorized, token failed"
      );
    }

    const user = await User.findById(decoded.id).select("-password");
    if (!user) throw new UnauthorizedError("User no longer exists");

    // A password change invalidates every access token issued before it
    if (user.passwordChangedAt && decoded.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)) {
      throw new UnauthorizedError("Password was changed, please log in again");
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};
