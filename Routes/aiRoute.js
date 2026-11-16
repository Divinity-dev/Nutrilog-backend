import express from "express";
import Post from "../models/post.js";
import AiSchedule from "../models/aiSchedule.js";
import slugify from "slugify";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { sendEmail } from "../utils/mail.js";
import { notifySubscribersOfPost } from "../utils/subscriberNotifications.js";
import { getReusablePostImage } from "../utils/articleImages.js";

const Route = express.Router();
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

const stripUnsafeHtml = (html) => String(html || "")
  .replace(/<\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
  .replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
  .replace(/javascript\s*:/gi, "");

const createArticleWithAI = async ({ topic, audience = "general readers", tone = "friendly and practical", length = "medium", keywords = "", avoidTitles = [] }) => {
  if (!process.env.GEMINI_API_KEY) throw new Error("AI_NOT_CONFIGURED");

  const systemInstruction = "You are the editorial writer for NutriBlogHub, a practical nutrition and healthy-living publication. Return valid JSON only with keys title, desc, seoTitle, seoDescription, tags (array of strings), and content (array of objects with header and text). Write original, useful, natural articles. For health topics, use cautious evidence-based language, never diagnose, never promise cures, and never invent studies, statistics, quotations, or sources. Do not recommend stopping prescribed treatment. Each section text must be simple HTML using only p, h3, ul, ol, li, strong, em, and a tags. Do not include scripts, styles, inline event handlers, or markdown fences. Include an introduction and a concise conclusion as sections. Create 6 to 9 substantial sections.";
  const userPrompt = `Create a complete NutriBlogHub article about: ${topic}. Audience: ${audience}. Tone: ${tone}. Length: ${length}. SEO keywords to naturally consider: ${keywords || "relevant nutrition and healthy living search terms"}. Make it helpful for readers in Nigeria and internationally where relevant. Avoid keyword stuffing. Do not repeat or closely imitate these recent article titles: ${avoidTitles.join(" | ") || "none supplied"}. Return only the requested JSON structure.`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`, {
    method: "POST",
    headers: {
      "x-goog-api-key": process.env.GEMINI_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0.7,
        responseMimeType: "application/json",
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message || "Gemini could not generate the article.");
    error.status = response.status;
    throw error;
  }

  const raw = payload?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim();
  if (!raw) {
    const reason = payload?.promptFeedback?.blockReason || payload?.candidates?.[0]?.finishReason;
    throw new Error(reason ? `Gemini did not return an article (${reason}).` : "Gemini returned an empty article.");
  }

  let article;
  try {
    let cleaned = raw.trim();
    if (cleaned.startsWith(String.fromCharCode(96).repeat(3))) {
      cleaned = cleaned.slice(cleaned.indexOf("\n") + 1);
      if (cleaned.trimEnd().endsWith(String.fromCharCode(96).repeat(3))) {
        cleaned = cleaned.trimEnd().slice(0, -3);
      }
    }
    article = JSON.parse(cleaned.trim());
  } catch {
    throw new Error("Gemini returned an invalid article format. Please try again.");
  }
  if (!article.title || !Array.isArray(article.content) || !article.content.length) {
    throw new Error("Gemini returned an incomplete article.");
  }
  return {
    title: String(article.title).slice(0, 180),
    desc: String(article.desc || "").slice(0, 320),
    seoTitle: String(article.seoTitle || article.title).slice(0, 180),
    seoDescription: String(article.seoDescription || article.desc || "").slice(0, 320),
    tags: Array.isArray(article.tags) ? article.tags.map((tag) => String(tag).slice(0, 40)).slice(0, 12) : [],
    content: article.content.slice(0, 12).map((section) => ({
      header: String(section.header || "").slice(0, 180),
      text: stripUnsafeHtml(section.text || ""),
    })),
  };
};

const findPexelsPhotos = async (query) => {
  if (!process.env.PEXELS_API_KEY) return [];
  const normalizedQuery = String(query || "healthy food nutrition").trim().slice(0, 120);
  if (!normalizedQuery) return [];
  const url = new URL("https://api.pexels.com/v1/search");
  url.searchParams.set("query", normalizedQuery);
  url.searchParams.set("orientation", "landscape");
  url.searchParams.set("per_page", "8");
  const response = await fetch(url, {
    headers: { Authorization: process.env.PEXELS_API_KEY },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error || "Pexels image search failed.");
    error.status = response.status;
    throw error;
  }
  return (Array.isArray(payload.photos) ? payload.photos : []).map((photo) => ({
    id: photo.id,
    image: photo.src?.large2x || photo.src?.large || photo.src?.landscape || "",
    photographer: String(photo.photographer || "Pexels contributor").slice(0, 120),
    photographerUrl: photo.photographer_url || "",
    photoUrl: photo.url || "https://www.pexels.com/",
    alt: String(photo.alt || normalizedQuery).slice(0, 240),
  })).filter((photo) => /^https:\/\//i.test(photo.image) && /^https:\/\//i.test(photo.photoUrl));
};

const generateCloudflareImage = async (prompt) => {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken) return null;

  const model = process.env.CLOUDFLARE_IMAGE_MODEL || "@cf/black-forest-labs/flux-1-schnell";
  const response = await fetch(
    "https://api.cloudflare.com/client/v4/accounts/" + accountId + "/ai/run/" + model,
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: String(prompt || "Healthy food and nutrition editorial photography").slice(0, 1800),
        steps: 4,
      }),
    }
  );

  const payload = await response.json().catch(() => ({}));
  const imageBase64 = payload?.result?.image;
  if (!response.ok || !imageBase64) {
    throw new Error(payload?.errors?.[0]?.message || "Cloudflare AI image generation failed.");
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || "dwivnxusa";
  const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET || "blog_upload";
  const form = new FormData();
  form.append(
    "file",
    new Blob([Buffer.from(imageBase64, "base64")], { type: "image/jpeg" }),
    "nutriblog-ai-featured.jpg"
  );
  form.append("upload_preset", uploadPreset);
  form.append("folder", "nutriblog/ai-generated");

  const uploadResponse = await fetch(
    "https://api.cloudinary.com/v1_1/" + cloudName + "/image/upload",
    { method: "POST", body: form }
  );
  const uploadPayload = await uploadResponse.json().catch(() => ({}));
  if (!uploadResponse.ok || !uploadPayload.secure_url) {
    throw new Error(uploadPayload?.error?.message || "Unable to save the generated image.");
  }
  return uploadPayload.secure_url;
};

const uniqueSlug = async (title) => {
  const base = slugify(title, { lower: true, strict: true }) || "ai-article";
  let slug = base;
  let suffix = 1;
  while (await Post.exists({ slug })) slug = `${base}-${suffix++}`;
  return slug;
};

Route.post("/generate", authenticate, requireAdmin, async (req, res) => {
  try {
    const topic = String(req.body.topic || "").trim().slice(0, 300);
    if (topic.length < 5) return res.status(400).json({ message: "Enter an article topic with at least 5 characters." });
    const article = await createArticleWithAI({
      topic,
      audience: String(req.body.audience || "general readers").slice(0, 120),
      tone: String(req.body.tone || "friendly and practical").slice(0, 120),
      length: ["short", "medium", "long"].includes(req.body.length) ? req.body.length : "medium",
      keywords: String(req.body.keywords || "").slice(0, 300),
    });
    return res.status(200).json(article);
  } catch (error) {
    if (error.message === "AI_NOT_CONFIGURED") return res.status(503).json({ message: "AI writing is not configured yet. Add GEMINI_API_KEY to the backend hosting environment." });
    return res.status(error.status && error.status < 500 ? error.status : 502).json({ message: error.message || "Unable to generate an article." });
  }
});

Route.post("/generate-image", authenticate, requireAdmin, async (req, res) => {
  try {
    if (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_API_TOKEN) {
      return res.status(503).json({
        message: "Free AI image generation is not configured yet. Add CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN to the backend hosting environment.",
      });
    }
    const prompt = String(req.body.prompt || "").trim().slice(0, 1800);
    if (prompt.length < 5) return res.status(400).json({ message: "Enter an article title or image description." });
    const image = await generateCloudflareImage(
      "Create a high-quality, realistic, editorial food and nutrition photograph for a health blog article titled: " + prompt +
      ". Natural lighting, appetizing but realistic food, clean composition, no text, no logos, landscape framing."
    );
    return res.status(200).json({ image, imageSource: "ai" });
  } catch (error) {
    return res.status(502).json({ message: error.message || "Unable to generate an AI image." });
  }
});

Route.post("/featured-images", authenticate, requireAdmin, async (req, res) => {
  try {
    if (!process.env.PEXELS_API_KEY) {
      return res.status(503).json({ message: "Pexels image search is not configured yet. Add PEXELS_API_KEY to the backend Preview environment." });
    }
    const query = String(req.body.query || "").trim().slice(0, 240);
    if (query.length < 2) return res.status(400).json({ message: "Enter an article title or topic to search for images." });
    const photos = await findPexelsPhotos(query);
    return res.status(200).json({
      photos,
      attribution: "Photos provided by Pexels",
    });
  } catch (error) {
    return res.status(error.status && error.status < 500 ? error.status : 502).json({
      message: error.message || "Unable to search Pexels for images.",
    });
  }
});

Route.get("/schedule", authenticate, requireAdmin, async (_req, res) => {
  try {
    const settings = await AiSchedule.findById("nutriblog-ai-schedule").lean();
    return res.status(200).json(settings || {
      _id: "nutriblog-ai-schedule",
      enabled: false,
      topicInstructions: "",
      frequency: "twiceWeekly",
      dayOfWeek: 2,
      daysOfWeek: [2, 5],
      autoPublish: false,
      scheduleTime: "09:00",
      timezone: "Africa/Lagos",
    });
  } catch {
    return res.status(500).json({ message: "Unable to load AI schedule." });
  }
});

Route.put("/schedule", authenticate, requireAdmin, async (req, res) => {
  try {
    const topicInstructions = String(req.body.topicInstructions || "").trim().slice(0, 1200);
    const frequency = ["daily", "weekly", "twiceWeekly", "threeTimesWeekly"].includes(req.body.frequency) ? req.body.frequency : "daily";
    const requestedDay = Number(req.body.dayOfWeek);
    const dayOfWeek = Number.isInteger(requestedDay) && requestedDay >= 0 && requestedDay <= 6 ? requestedDay : 1;
    const requestedDays = Array.isArray(req.body.daysOfWeek) ? req.body.daysOfWeek.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6) : [];
    const daysOfWeek = [...new Set(requestedDays)].sort((a, b) => a - b);
    const scheduleTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(req.body.scheduleTime) ? req.body.scheduleTime : "09:00";
    const settings = await AiSchedule.findByIdAndUpdate("nutriblog-ai-schedule", {
      $set: {
        enabled: Boolean(req.body.enabled),
        topicInstructions,
        frequency,
        dayOfWeek,
        daysOfWeek: daysOfWeek.length ? daysOfWeek : (frequency === "twiceWeekly" ? [2, 5] : [dayOfWeek]),
        autoPublish: Boolean(req.body.autoPublish),
        scheduleTime,
        timezone: "Africa/Lagos",
      },
      $setOnInsert: { lastRunAt: null },
    }, { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true });
    return res.status(200).json(settings);
  } catch {
    return res.status(500).json({ message: "Unable to save AI schedule." });
  }
});

Route.get("/cron", async (req, res) => {
  const secret = process.env.CRON_SECRET;
  const supplied = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!secret || supplied.length !== secret.length || supplied !== secret) {
    return res.status(401).json({ message: "Unauthorized cron request." });
  }

  try {
    const settings = await AiSchedule.findById("nutriblog-ai-schedule");
    if (!settings?.enabled || !settings.topicInstructions) {
      return res.status(200).json({ message: "AI schedule is disabled or has no topic instructions.", skipped: true });
    }

    const now = new Date();
    const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
    const localWeekday = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Lagos", weekday: "short" }).format(now) === "Sun" ? 0 :
      ({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 })[new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Lagos", weekday: "short" }).format(now)]);
    const localTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
    if (localTime < settings.scheduleTime) return res.status(200).json({ message: "Scheduled time has not arrived.", skipped: true });
    const scheduledDays = Array.isArray(settings.daysOfWeek) && settings.daysOfWeek.length
      ? settings.daysOfWeek
      : [settings.dayOfWeek ?? 1];
    if (settings.frequency !== "daily" && !scheduledDays.includes(localWeekday)) {
      return res.status(200).json({ message: "Not a configured publishing day.", skipped: true });
    }
    if (settings.lastRunAt) {
      const lastDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).format(settings.lastRunAt);
      if (lastDate === localDate) return res.status(200).json({ message: "Already ran today.", skipped: true });
    }

    settings.lastRunAt = now;
    await settings.save();

    const recentPosts = await Post.find().sort({ createdAt: -1 }).limit(30).select("title").lean();
    const article = await createArticleWithAI({
      topic: `Choose one fresh, specific article topic from this editorial direction: ${settings.topicInstructions}`,
      audience: "general readers",
      tone: "friendly, clear, practical and evidence-aware",
      length: "long",
      avoidTitles: recentPosts.map((item) => item.title),
    });
    let generatedImage = null;
    try {
      generatedImage = await generateCloudflareImage(
        "Create a high-quality, realistic, editorial food and nutrition photograph for a health blog article titled: " + article.title +
        ". Natural lighting, appetizing but realistic food, clean composition, no text, no logos, landscape framing."
      );
    } catch {
      // Continue to Pexels and the reusable image library if AI image generation is unavailable.
    }

    let featuredPhoto = null;
    if (!generatedImage && process.env.PEXELS_API_KEY) {
      try {
        const photos = await findPexelsPhotos(article.title + " healthy food nutrition");
        featuredPhoto = photos[0] || null;
      } catch {
        // Image search is optional; article creation must continue.
      }
    }
    const reusedImage = generatedImage || featuredPhoto ? null : await getReusablePostImage();
    const post = await Post.create({
      ...article,
      slug: await uniqueSlug(article.title),
      image: generatedImage || featuredPhoto?.image || reusedImage?.image || "",
      imageSource: generatedImage ? "ai" : featuredPhoto ? "pexels" : reusedImage ? "reused" : "none",
      imageCredit: featuredPhoto ? {
        provider: "Pexels",
        photographer: featuredPhoto.photographer,
        photographerUrl: featuredPhoto.photographerUrl,
        photoUrl: featuredPhoto.photoUrl,
      } : reusedImage?.imageCredit || undefined,
      status: settings.autoPublish ? "published" : "draft",
      generatedByAI: true,
    });

    if (post.status === "published") {
      notifySubscribersOfPost(post).catch((error) => console.error("Subscriber notification failed:", error.message));
    }

    const notify = process.env.AI_NOTIFICATION_EMAIL || process.env.ADMIN_EMAIL;
    if (notify) {
      try {
        await sendEmail({
          to: notify,
          subject: settings.autoPublish ? "Your scheduled NutriBlogHub article was published" : "Your new NutriBlogHub AI draft is ready",
          text: `The scheduled AI article "${post.title}" has been created as ${post.status}. Review it in your NutriBlogHub admin area.`,
          html: `<p>Your scheduled AI article <strong>${post.title}</strong> has been created as <strong>${post.status}</strong>.</p><p>Review it in your NutriBlogHub admin area.</p>`,
        });
      } catch { /* Email notification is optional; article generation must still complete. */ }
    }
    return res.status(200).json({ message: "Scheduled article generated.", postId: post._id, status: post.status });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Scheduled article generation failed." });
  }
});

export default Route;
