import express from "express";
import Post from "../models/post.js";
import AiSchedule from "../models/aiSchedule.js";
import slugify from "slugify";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { sendEmail } from "../utils/mail.js";

const Route = express.Router();
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

const stripUnsafeHtml = (html) => String(html || "")
  .replace(/<\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
  .replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
  .replace(/javascript\s*:/gi, "");

const createArticleWithAI = async ({ topic, audience = "general readers", tone = "friendly and practical", length = "medium", keywords = "" }) => {
  if (!process.env.OPENAI_API_KEY) throw new Error("AI_NOT_CONFIGURED");
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You are the editorial writer for NutriBlogHub, a practical nutrition and healthy-living publication. Return valid JSON only with keys title, desc, seoTitle, seoDescription, tags (array of strings), and content (array of objects with header and text). Write original, useful, natural articles. For health topics, use cautious evidence-based language, never diagnose, never promise cures, and never invent studies, statistics, quotations, or sources. Do not recommend stopping prescribed treatment. Each section text must be simple HTML using only p, h3, ul, ol, li, strong, em, and a tags. Do not include scripts, styles, inline event handlers, or markdown fences. Include an introduction and a concise conclusion as sections. Create 6 to 9 substantial sections."
        },
        {
          role: "user",
          content: `Create a complete NutriBlogHub article about: ${topic}. Audience: ${audience}. Tone: ${tone}. Length: ${length}. SEO keywords to naturally consider: ${keywords || "relevant nutrition and healthy living search terms"}. Make it helpful for readers in Nigeria and internationally where relevant. Avoid keyword stuffing. Return only the requested JSON structure.`
        }
      ]
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message || "The AI writing service could not generate the article.");
    error.status = response.status;
    throw error;
  }
  const raw = payload?.choices?.[0]?.message?.content;
  if (!raw) throw new Error("The AI service returned an empty article.");
  const article = JSON.parse(raw);
  if (!article.title || !Array.isArray(article.content) || !article.content.length) {
    throw new Error("The AI service returned an incomplete article.");
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
    if (error.message === "AI_NOT_CONFIGURED") return res.status(503).json({ message: "AI writing is not configured yet. Add OPENAI_API_KEY to the backend hosting environment." });
    return res.status(error.status && error.status < 500 ? error.status : 502).json({ message: error.message || "Unable to generate an article." });
  }
});

Route.get("/schedule", authenticate, requireAdmin, async (_req, res) => {
  try {
    const settings = await AiSchedule.findById("nutriblog-ai-schedule").lean();
    return res.status(200).json(settings || {
      _id: "nutriblog-ai-schedule",
      enabled: false,
      topicInstructions: "",
      frequency: "daily",
      dayOfWeek: 1,
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
    const frequency = req.body.frequency === "weekly" ? "weekly" : "daily";
    const dayOfWeek = Math.min(6, Math.max(0, Number(req.body.dayOfWeek) || 1));
    const scheduleTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(req.body.scheduleTime) ? req.body.scheduleTime : "09:00";
    const settings = await AiSchedule.findByIdAndUpdate("nutriblog-ai-schedule", {
      $set: {
        enabled: Boolean(req.body.enabled),
        topicInstructions,
        frequency,
        dayOfWeek,
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
    if (settings.frequency === "weekly" && localWeekday !== settings.dayOfWeek) return res.status(200).json({ message: "Not the configured publishing day.", skipped: true });
    if (settings.lastRunAt) {
      const lastDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).format(settings.lastRunAt);
      if (lastDate === localDate) return res.status(200).json({ message: "Already ran today.", skipped: true });
    }

    settings.lastRunAt = now;
    await settings.save();

    const article = await createArticleWithAI({ topic: settings.topicInstructions, audience: "general readers", tone: "friendly, clear, practical and evidence-aware", length: "long" });
    const post = await Post.create({
      ...article,
      slug: await uniqueSlug(article.title),
      status: settings.autoPublish ? "published" : "draft",
      generatedByAI: true,
    });

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
