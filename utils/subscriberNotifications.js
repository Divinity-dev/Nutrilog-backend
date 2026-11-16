import Subscriber from "../models/subscribers.js";
import { sendEmail } from "./mail.js";
import { createHmac } from "node:crypto";

const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]));

export const notifySubscribersOfPost = async (post) => {
  if (!post?._id || !post?.title || post.status !== "published") return { sent: 0, failed: 0 };
  const subscribers = await Subscriber.find({
    $or: [{ status: "active" }, { status: { $exists: false } }],
  }).select("_id email").lean();
  let sent = 0;
  let failed = 0;
  const origin = (process.env.FRONTEND_URL || "https://www.nutribloghub.com").split(",")[0].trim().replace(/\/$/, "");
  const title = escapeHtml(post.title);
  const description = escapeHtml(post.desc || "A new article is now available on NutriBlogHub.");
  const articleUrl = `${origin}/blog/${encodeURIComponent(post.slug)}`;

  for (let index = 0; index < subscribers.length; index += 10) {
    const batch = subscribers.slice(index, index + 10);
    const results = await Promise.allSettled(batch.map(async (subscriber) => {
      const token = createHmac("sha256", process.env.JWT_SECRET)
        .update(`${subscriber._id}:${subscriber.email}:unsubscribe`).digest("hex");
      const unsubscribeUrl = `${origin}/unsubscribe/${subscriber._id}?token=${token}`;
      await sendEmail({
        to: subscriber.email,
        subject: `New on NutriBlogHub: ${post.title}`,
        text: `A new article has been published: ${post.title}\n\n${post.desc || ""}\n\nRead it: ${articleUrl}\n\nUnsubscribe: ${unsubscribeUrl}`,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#222;max-width:600px;margin:auto"><p style="color:#15803d;font-weight:bold">NutriBlogHub</p><h2>${title}</h2><p>${description}</p><p><a href="${articleUrl}" style="display:inline-block;background:#15803d;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none">Read the new article</a></p><hr style="border:0;border-top:1px solid #ddd;margin:28px 0"/><p style="font-size:12px;color:#666">You receive this because you subscribed to new article notifications from NutriBlogHub. <a href="${unsubscribeUrl}">Unsubscribe</a>.</p></div>`,
      });
    }));
    for (const result of results) result.status === "fulfilled" ? sent++ : failed++;
  }
  return { sent, failed };
};
