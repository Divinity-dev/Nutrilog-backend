import mongoose from "mongoose";

const CommentSchema = new mongoose.Schema({
  post: { type: mongoose.Schema.Types.ObjectId, ref: "Post", required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  authorName: { type: String, required: true, trim: true, maxlength: 80 },
  authorEmail: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
  body: { type: String, required: true, trim: true, maxlength: 2000 },
  status: { type: String, enum: ["approved", "pending", "rejected"], default: "approved", index: true },
  likeKeys: { type: [String], default: [] },
}, { timestamps: true });

CommentSchema.index({ post: 1, status: 1, createdAt: -1 });

export default mongoose.model("Comment", CommentSchema);
