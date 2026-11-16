import mongoose from "mongoose";

const SubscriberSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    status: { type: String, enum: ["pending", "active", "unsubscribed"], default: "pending", index: true },
    source: { type: String, default: "website", maxlength: 40 },
    confirmationTokenHash: { type: String, default: undefined, select: false },
    confirmationExpiresAt: { type: Date, default: undefined, select: false },
    confirmedAt: { type: Date, default: undefined },
    unsubscribedAt: { type: Date, default: undefined },
  },
  { timestamps: true }
);

export default mongoose.model("Subscriber", SubscriberSchema);
