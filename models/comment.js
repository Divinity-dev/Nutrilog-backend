import mongoose from "mongoose";

const CommentSchema = new mongoose.Schema({
  post: { type: mongoose.Schema.Types.ObjectId, ref: "Post", required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254, select: false },
  body: { type: String, required: true, trim: true, maxlength: 2000 },
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  moderatedAt: { type: Date, default: null },
}, { timestamps: true });

CommentSchema.index({ post: 1, status: 1, createdAt: -1 });

export default mongoose.model("Comment", CommentSchema);
