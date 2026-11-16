import mongoose from "mongoose";

const PostSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 180 },
    image: { type: String, default: process.env.DEFAULT_ARTICLE_IMAGE_URL || "/images/nutriblog-default.svg" },
    imageCredit: {
      provider: { type: String, default: "" },
      photographer: { type: String, default: "" },
      photographerUrl: { type: String, default: "" },
      photoUrl: { type: String, default: "" },
    },
    slug: { type: String, required: true, unique: true },
    desc: { type: String, default: "", maxlength: 400 },
    categories: [{ type: mongoose.Schema.Types.ObjectId, ref: "Category" }],
    content: [{
      header: { type: String, maxlength: 180 },
      text: { type: String, required: true },
    }],
    status: { type: String, enum: ["draft", "published"], default: "published", index: true },
    seoTitle: { type: String, maxlength: 180, default: "" },
    seoDescription: { type: String, maxlength: 320, default: "" },
    tags: [{ type: String, maxlength: 40 }],
    generatedByAI: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model("Post", PostSchema);
