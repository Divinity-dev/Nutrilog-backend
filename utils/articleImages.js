import Post from "../models/post.js";

export const getReusablePostImage = async ({ categories = [], excludeImage = "" } = {}) => {
  const excluded = ["/images/nutriblog-default.svg", ""];
  if (excludeImage) excluded.push(excludeImage);

  const publishedFilter = { $or: [{ status: "published" }, { status: { $exists: false } }] };
  const latestPost = await Post.findOne({
    ...publishedFilter,
    image: { $exists: true, $nin: excluded },
  }).sort({ createdAt: -1 }).select("image").lean();
  const latestImage = latestPost?.image || null;
  if (latestImage) excluded.push(latestImage);

  const baseFilter = {
    image: { $exists: true, $nin: excluded },
    ...publishedFilter,
  };
  const projection = "image imageCredit imageSource";

  let candidates = [];
  if (Array.isArray(categories) && categories.length) {
    candidates = await Post.find({
      ...baseFilter,
      categories: { $in: categories },
    }).sort({ createdAt: -1 }).limit(60).select(projection).lean();
  }

  if (!candidates.length) {
    candidates = await Post.find(baseFilter)
      .sort({ createdAt: -1 })
      .limit(100)
      .select(projection)
      .lean();
  }

  if (!candidates.length && latestImage) {
    candidates = await Post.find({
      ...publishedFilter,
      image: { $exists: true, $nin: ["/images/nutriblog-default.svg", ""] },
    }).sort({ createdAt: -1 }).limit(100).select(projection).lean();
  }

  const uniqueByImage = new Map();
  for (const post of candidates) {
    if (post.image && !uniqueByImage.has(post.image)) uniqueByImage.set(post.image, post);
  }
  const uniqueImages = [...uniqueByImage.values()];
  if (!uniqueImages.length) return null;

  const selected = uniqueImages[Math.floor(Math.random() * uniqueImages.length)];
  return {
    image: selected.image,
    imageCredit: selected.imageCredit || undefined,
    imageSource: selected.imageSource || "reused",
  };
};
