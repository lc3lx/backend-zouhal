const mongoose = require("mongoose");

const secondaryCategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      required: [true, "Secondary category name is required"],
      unique: [true, "Secondary category must be unique"],
      minlength: [2, "Too short secondary category name"],
      maxlength: [32, "Too long secondary category name"],
    },
    slug: {
      type: String,
      lowercase: true,
    },
    subCategory: {
      type: mongoose.Schema.ObjectId,
      ref: "SubCategory",
      required: [true, "Secondary category must belong to a subcategory"],
    },
    category: {
      type: mongoose.Schema.ObjectId,
      ref: "Category",
      required: [true, "Secondary category must belong to a category"],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("SecondaryCategory", secondaryCategorySchema);
