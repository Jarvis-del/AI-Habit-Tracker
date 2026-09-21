import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 8 },
    passwordChangedAt: { type: Date, default: null },
    settings: {
      theme: { type: String, enum: ["light", "dark", "system"], default: "system" },
      morningMotivationEnabled: { type: Boolean, default: true },
      timezone: { type: String, default: "UTC" },
    },
  },
  { timestamps: true }
);

// Hash password automatically before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(Number(process.env.BCRYPT_ROUNDS) || 12);
  this.password = await bcrypt.hash(this.password, salt);
  if (!this.isNew) this.passwordChangedAt = new Date(); // invalidates access tokens issued before now
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.toSafeObject = function () {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    settings: this.settings,
    createdAt: this.createdAt,
  };
};

export default mongoose.model("User", userSchema);
