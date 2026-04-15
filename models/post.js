import mongoose from "mongoose";

const PostSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },

    image: {
      type: String,
    },
      slug: {
  type: String,
  required: true,
  unique: true
},

    content: [
      {
        header: {
          type: String,
        },
        text: {
          type: String,
          required: true,
        },
      },
    ],
  },

  {
    timestamps: true,
  }
);

export default mongoose.model("Post", PostSchema);