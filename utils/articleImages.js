import Post from "../models/post.js";

export const getReusablePostImage = async ({ categories = [], excludeImage = "" } = {}) => {
  const excluded = ["/images/nutriblog-default.svg", ""];
  if (excludeImage) excluded.push(excludeImage);

  const baseFilter = {
    image: { $exists: true, $nin: excluded },
    $or: [{ status: "published" }, { status: { $exists: false } }],
  };

  let candidates = [];
  if (Array.isArray(categories) && categories.length) {
    candidates = await Post.find({
      ...baseFilter,
      categories: { $in: categories },
    }).sort({ createdAt: -1 }).limit(60).select("image").lean();
  }

  if (!candidates.length) {
    candidates = await Post.find(baseFilter)
      .sort({ createdAt: -1 })
      .limit(100)
      .select("image")
      .lean();
  }

  const uniqueImages = [...new Set(candidates.map((post) => post.image).filter(Boolean))];
  if (!uniqueImages.length) return null;

  return uniqueImages[Math.floor(Math.random() * uniqueImages.length)];
};
