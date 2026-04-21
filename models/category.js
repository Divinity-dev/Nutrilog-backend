import mongoose from "mongoose";

const CatSchema = new mongoose.Schema({
  name: { type: String, unique: true, required: true },
});

export default mongoose.model("Category", CatSchema);