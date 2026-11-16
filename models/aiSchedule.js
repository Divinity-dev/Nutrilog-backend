import mongoose from "mongoose";

const AiScheduleSchema = new mongoose.Schema({
  _id: { type: String, default: "nutriblog-ai-schedule" },
  enabled: { type: Boolean, default: false },
  topicInstructions: { type: String, default: "", maxlength: 1200 },
  frequency: { type: String, enum: ["daily", "weekly", "twiceWeekly", "threeTimesWeekly"], default: "daily" },
  dayOfWeek: { type: Number, min: 0, max: 6, default: 1 },
  daysOfWeek: { type: [Number], default: [2, 5], validate: { validator: (days) => days.every((day) => Number.isInteger(day) && day >= 0 && day <= 6), message: "Invalid publishing weekday." } },
  scheduleTime: { type: String, default: "09:00" },
  timezone: { type: String, default: "Africa/Lagos" },
  autoPublish: { type: Boolean, default: false },
  lastRunAt: { type: Date, default: null },
}, { timestamps: true });

export default mongoose.model("AiSchedule", AiScheduleSchema);
