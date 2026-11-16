import mongoose from "mongoose";

const AiScheduleSchema = new mongoose.Schema({
  _id: { type: String, default: "nutriblog-ai-schedule" },
  enabled: { type: Boolean, default: false },
  topicInstructions: { type: String, default: "", maxlength: 1200 },
  frequency: { type: String, enum: ["daily", "weekly"], default: "daily" },
  dayOfWeek: { type: Number, min: 0, max: 6, default: 1 },
  scheduleTime: { type: String, default: "09:00" },
  timezone: { type: String, default: "Africa/Lagos" },
  autoPublish: { type: Boolean, default: false },
  lastRunAt: { type: Date, default: null },
}, { timestamps: true, _id: false });

export default mongoose.model("AiSchedule", AiScheduleSchema);
