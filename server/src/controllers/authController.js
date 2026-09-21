import bcrypt from "bcryptjs";
import User from "../models/User.js";
import RefreshToken from "../models/RefreshToken.js";
import {
  generateToken,
  generateRefreshToken,
  hashToken,
  newFamilyId,
  REFRESH_COOKIE,
  REFRESH_TTL_DAYS,
  refreshCookieOptions,
} from "../utils/generateToken.js";
import { ApiError, BadRequestError, UnauthorizedError } from "../utils/errorClasses.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cleanEmail = (email) => String(email ?? "").trim().toLowerCase();

// bcrypt only looks at the first 72 bytes, so longer passwords are rejected instead of silently truncated
function assertStrongPassword(password) {
  if (password.length < 8) throw new BadRequestError("Password must be at least 8 characters");
  if (Buffer.byteLength(password) > 72) throw new BadRequestError("Password must be at most 72 bytes long");
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new BadRequestError("Password must contain at least one letter and one number");
  }
}

// Lets login spend the same time hashing when the email doesn't exist (no user-enumeration by timing)
let dummyHash;
const getDummyHash = () => (dummyHash ??= bcrypt.hash("not-a-real-password-1", Number(process.env.BCRYPT_ROUNDS) || 12));

const clearRefreshCookie = (res) => {
  const { maxAge, ...opts } = refreshCookieOptions();
  res.clearCookie(REFRESH_COOKIE, opts);
};

/** Creates + stores a refresh token, sets it as an httpOnly cookie, returns a fresh access token. */
async function startSession(req, res, user, family = newFamilyId(), parentHash) {
  const raw = generateRefreshToken();
  await RefreshToken.create({
    user: user._id,
    tokenHash: hashToken(raw),
    family,
    ...(parentHash ? { parentHash } : {}),
    expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS() * 86_400_000),
    userAgent: String(req.get("user-agent") || "").slice(0, 200),
    ip: req.ip || "",
  });
  res.cookie(REFRESH_COOKIE, raw, refreshCookieOptions());
  return generateToken(user._id);
}

// POST /api/v1/auth/register
export const register = async (req, res, next) => {
  try {
    const name = String(req.body.name ?? "").trim().slice(0, 80);
    const email = cleanEmail(req.body.email);
    const password = String(req.body.password ?? "");

    if (!name) throw new BadRequestError("Name is required");
    if (!EMAIL_RE.test(email)) throw new BadRequestError("Please enter a valid email address");
    assertStrongPassword(password);

    const existing = await User.findOne({ email });
    if (existing) throw new BadRequestError("An account with this email already exists");

    const user = await User.create({ name, email, password });
    const token = await startSession(req, res, user);

    res.status(201).json({ success: true, token, user: user.toSafeObject() });
  } catch (err) {
    next(err);
  }
};

// POST /api/v1/auth/login
export const login = async (req, res, next) => {
  try {
    const email = cleanEmail(req.body.email);
    const password = String(req.body.password ?? "");

    const user = await User.findOne({ email });
    const match = user ? await user.comparePassword(password) : (await bcrypt.compare(password, await getDummyHash()), false);
    if (!user || !match) throw new UnauthorizedError("Invalid email or password");

    const token = await startSession(req, res, user);
    res.json({ success: true, token, user: user.toSafeObject() });
  } catch (err) {
    next(err);
  }
};

// POST /api/v1/auth/refresh   (cookie only; rotates the refresh token)
export const refresh = async (req, res, next) => {
  try {
    const raw = req.cookies?.[REFRESH_COOKIE];
    if (!raw || typeof raw !== "string") throw new UnauthorizedError("No active session");

    const tokenHash = hashToken(raw);
    const now = new Date();

    // Atomically "claim" the token so two simultaneous requests can never both succeed
    const claimed = await RefreshToken.findOneAndUpdate(
      { tokenHash, revokedAt: null, expiresAt: { $gt: now } },
      { revokedAt: now },
      { new: false }
    );

    if (!claimed) {
      const known = await RefreshToken.findOne({ tokenHash });
      if (known?.revokedAt) {
        // Used a moment ago by another tab/request: benign race, tell the client to retry
        if (now - known.revokedAt < 10_000) {
          const err = new UnauthorizedError("Session refresh in progress, retry");
          err.code = "REFRESH_RACE";
          throw err;
        }
        // Used long ago -> someone replayed a stolen token. Kill the entire family.
        await RefreshToken.updateMany({ family: known.family, revokedAt: null }, { revokedAt: now });
      }
      clearRefreshCookie(res);
      throw new UnauthorizedError("Session expired, please log in again");
    }

    const user = await User.findById(claimed.user);
    if (!user) {
      clearRefreshCookie(res);
      throw new UnauthorizedError("User no longer exists");
    }

    let token;
    try {
      token = await startSession(req, res, user, claimed.family, tokenHash);
    } catch (err) {
      if (err.code === 11000) {
        // another request already rotated this token (duplicate parentHash) -> we lost the race
        const race = new UnauthorizedError("Session refresh in progress, retry");
        race.code = "REFRESH_RACE";
        throw race;
      }
      throw err;
    }
    res.json({ success: true, token, user: user.toSafeObject() });
  } catch (err) {
    if (err.code === "REFRESH_RACE") {
      return res.status(401).json({ success: false, code: "REFRESH_RACE", message: err.message });
    }
    next(err);
  }
};

// POST /api/v1/auth/logout   (revokes this device's session; always succeeds)
export const logout = async (req, res, next) => {
  try {
    const raw = req.cookies?.[REFRESH_COOKIE];
    if (raw && typeof raw === "string") {
      const known = await RefreshToken.findOne({ tokenHash: hashToken(raw) });
      if (known) await RefreshToken.updateMany({ family: known.family, revokedAt: null }, { revokedAt: new Date() });
    }
    clearRefreshCookie(res);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// POST /api/v1/auth/logout-all   (revokes sessions on every device)
export const logoutAll = async (req, res, next) => {
  try {
    await RefreshToken.updateMany({ user: req.user._id, revokedAt: null }, { revokedAt: new Date() });
    clearRefreshCookie(res);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// POST /api/v1/auth/change-password   { currentPassword, newPassword }
export const changePassword = async (req, res, next) => {
  try {
    const currentPassword = String(req.body.currentPassword ?? "");
    const newPassword = String(req.body.newPassword ?? "");
    assertStrongPassword(newPassword);
    if (newPassword === currentPassword) throw new BadRequestError("New password must be different from the current one");

    const user = await User.findById(req.user._id);
    if (!user || !(await user.comparePassword(currentPassword))) {
      // 400, not 401: the session is fine, only the typed password is wrong (401 would log the user out)
      throw new ApiError(400, "Current password is incorrect");
    }

    user.password = newPassword;
    await user.save(); // pre-save hook hashes it and stamps passwordChangedAt

    // sign out every other device, then give THIS device a fresh session
    await RefreshToken.updateMany({ user: user._id, revokedAt: null }, { revokedAt: new Date() });
    const token = await startSession(req, res, user);

    res.json({ success: true, token, user: user.toSafeObject(), message: "Password updated. Other devices were signed out." });
  } catch (err) {
    next(err);
  }
};

// GET /api/v1/auth/me
export const getMe = async (req, res, next) => {
  try {
    res.json({ success: true, user: req.user.toSafeObject() });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/v1/auth/settings
export const updateSettings = async (req, res, next) => {
  try {
    const { theme, morningMotivationEnabled, timezone } = req.body;
    if (theme !== undefined) req.user.settings.theme = theme;
    if (morningMotivationEnabled !== undefined) req.user.settings.morningMotivationEnabled = morningMotivationEnabled;
    if (timezone !== undefined) req.user.settings.timezone = timezone;
    await req.user.save();
    res.json({ success: true, user: req.user.toSafeObject() });
  } catch (err) {
    next(err);
  }
};
