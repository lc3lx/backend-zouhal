const mongoose = require("mongoose");

// Color Schema
const colorSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Color name is required"],
      trim: true,
      minlength: [1, "Too short color name"],
      maxlength: [50, "Too long color name"],
    },
    hex: {
      type: String,
      required: [true, "Color hex code is required"],
      trim: true,
      match: [/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, "Invalid hex color code"],
    },
    categoryIds: [
      {
        type: mongoose.Schema.ObjectId,
        ref: "Category",
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
colorSchema.index({ name: 1 }, { unique: true });
colorSchema.index({ hex: 1 }, { unique: true });
colorSchema.index({ categoryIds: 1 });

// Populate categories when querying
colorSchema.pre(/^find/, function (next) {
  this.populate({
    path: "categoryIds",
    select: "name _id",
  });
  next();
});

// Create model
const ColorModel = mongoose.model("Color", colorSchema);

module.exports = ColorModel;
