import mongoose from "mongoose";

const AiScheduleSchema = new mongoose.Schema({
  _id: { type: String, default: "nutriblog-ai-schedule" },
  enabled: { type: Boolean, default: false },
  topicInstructions: { type: String, default: "", maxlength: 1200 },
  frequency: { type: String, enum: ["daily", "weekly", "twiceWeekly", "threeTimesWeekly"], default: "twiceWeekly" },
  dayOfWeek: { type: Number, min: 0, max: 6, default: 2 },
  daysOfWeek: { type: [Number], default: [2, 5] },
  autoPublish: { type: Boolean, default: false },
  scheduleTime: { type: String, default: "09:00", match: /^([01]\d|2[0-3]):[0-5]\d$/ },
  timezone: { type: String, default: "Africa/Lagos" },
  lastRunAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false });

export default mongoose.models.AiSchedule || mongoose.model("AiSchedule", AiScheduleSchema);
