import mongoose from "mongoose";

const PostSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  image: { type: String, default: "" },
  imageSource: { type: String, enum: ["manual", "pexels", "ai", "reused", "none"], default: "manual" },
  imageCredit: {
    provider: String,
    photographer: String,
    photographerUrl: String,
    photoUrl: String,
  },
  slug: { type: String, required: true, unique: true },
  desc: { type: String, default: "" },
  seoTitle: { type: String, default: "" },
  seoDescription: { type: String, default: "" },
  tags: { type: [String], default: [] },
  status: { type: String, enum: ["draft", "published"], default: "published", index: true },
  generatedByAI: { type: Boolean, default: false },
  categories: [{ type: mongoose.Schema.Types.ObjectId, ref: "Category" }],
  content: [{
    header: { type: String },
    text: { type: String, required: true },
  }],
}, { timestamps: true });

export default mongoose.model("Post", PostSchema);
