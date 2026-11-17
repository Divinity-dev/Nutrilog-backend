import Subscriber from "../models/subscribers.js";
import { sendEmail } from "./mail.js";
import { createHmac } from "node:crypto";

const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]));

export const notifySubscribersOfPost = async (post) => {
  if (!post?._id || !post?.title || post.status !== "published") return { sent: 0, failed: 0 };
  if (process.env.VERCEL_ENV === "preview" && process.env.SUBSCRIBER_NOTIFICATIONS_ENABLED !== "true") {
    return { sent: 0, failed: 0, skipped: "Preview email delivery is disabled." };
  }
  // Explicitly active subscribers and legacy records with no status are opted-in readers.
  // Keep pending and unsubscribed records excluded.
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is missing; subscriber unsubscribe links cannot be generated.");
  }

  const subscribers = await Subscriber.find({ $or: [{ status: "active" }, { status: { $exists: false } }, { status: null }] })
    .select("_id email").lean();
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
      const unsubscribeUrl = `${origin}/unsubscribe?id=${subscriber._id}&token=${token}`;
      const delivery = await sendEmail({
        to: subscriber.email,
        subject: `New on NutriBlogHub: ${post.title}`,
        text: `A new article has been published: ${post.title}\n\n${post.desc || ""}\n\nRead it: ${articleUrl}\n\nUnsubscribe: ${unsubscribeUrl}`,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#222;max-width:600px;margin:auto"><p style="color:#15803d;font-weight:bold">NutriBlogHub</p><h2>${title}</h2><p>${description}</p><p><a href="${articleUrl}" style="display:inline-block;background:#15803d;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none">Read the new article</a></p><hr style="border:0;border-top:1px solid #ddd;margin:28px 0"/><p style="font-size:12px;color:#666">You receive this because you subscribed to new article notifications from NutriBlogHub. <a href="${unsubscribeUrl}">Unsubscribe</a>.</p></div>`,
      });
      const accepted = Array.isArray(delivery.accepted) ? delivery.accepted.map((address) => String(address).toLowerCase()) : [];
      if (!accepted.includes(String(subscriber.email).toLowerCase())) {
        throw new Error(delivery.response || "SMTP did not accept the subscriber address.");
      }
    }));
    for (const result of results) {
      if (result.status === "fulfilled") {
        sent++;
      } else {
        failed++;
        console.error("Subscriber email delivery failed:", result.reason?.message || "Unknown email error");
      }
    }
  }
  return { eligible: subscribers.length, sent, failed };
};
