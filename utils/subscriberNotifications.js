import Subscriber from "../models/subscribers.js";
import { sendEmail } from "./mail.js";

export const notifySubscribersOfPost = async (post) => {
  const subscribers = await Subscriber.find().select("email").lean();
  if (!subscribers.length) return { sent: 0 };

  const postUrl = "https://www.nutribloghub.com/blog/" + encodeURIComponent(post.slug);
  const results = await Promise.allSettled(subscribers.map(({ email }) => sendEmail({
    to: email,
    subject: "New on NutriBlogHub: " + post.title,
    text: "A new article is available: " + post.title + "\n\nRead it here: " + postUrl + "\n\nYou are receiving this because you subscribed to NutriBlogHub.",
    html: "<p>A new article is available on NutriBlogHub:</p><p><strong>" + post.title + "</strong></p><p><a href=\"" + postUrl + "\">Read the article</a></p>",
  })));

  return {
    sent: results.filter((result) => result.status === "fulfilled").length,
    failed: results.filter((result) => result.status === "rejected").length,
  };
};
