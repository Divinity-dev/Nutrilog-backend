import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
  userName: { type: String, required: true, unique: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["user", "admin"], default: "user" },
  resetPasswordCodeHash: { type: String, select: false },
  resetPasswordExpires: { type: Date, select: false },
  resetPasswordRequestedAt: { type: Date, select: false },
  resetPasswordAttempts: { type: Number, default: 0, select: false },
}, { timestamps: true });

export default mongoose.model("User", UserSchema);
