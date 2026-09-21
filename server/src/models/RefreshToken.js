import mongoose from "mongoose";

// One document per issued refresh token. Only a SHA-256 hash is stored, so a database leak
// does not leak usable sessions. Tokens are single-use (rotated on every refresh); all tokens
// descended from one login share a `family` so a reuse attack can revoke the whole chain.
const refreshTokenSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    family: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    replacedByHash: { type: String, default: null },
    // Hash of the token this one replaced. The UNIQUE index guarantees a token can be rotated
    // exactly once: if two requests race, the database itself rejects the second successor.
    parentHash: { type: String, unique: true, sparse: true },
    userAgent: { type: String, default: "" },
    ip: { type: String, default: "" },
  },
  { timestamps: true }
);

// MongoDB deletes the document automatically once expiresAt has passed
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("RefreshToken", refreshTokenSchema);
